import React, { useState } from 'react';
import * as d3 from "d3";
import { sankey, sankeyLinkHorizontal} from "d3-sankey";
import smoothHull from '../../utils/convexHull';


import "../styles/MainGraph.scss";
import WeightPanel from '../weight/WeightPanel';
import SidePanel from "./SidePanel";
import EvidencePanelWrapper from './EvidencePanelWrapper';

const dummyData = {
    'nodes': { nodes: ["uniprot:P05231"] },
    category_count: {
        categorycount: {
            "1": 5,
            "2": 5,
            "3": 5,
            "4": 5,
        }
    }
};

const idToClass = id => {
    if (typeof id === 'string' || id instanceof String) {
        // @ts-ignore
        return id.replaceAll(':', '_');
    }
    else {
        return id.id.replaceAll(':', '_');
    }
}

const ALPHA_TARGET = 0.1;
const ALPHA_MINVAL = -1;
const ALPHA_INIT = 1;

// These are the initially assumed height. After rendering the html, these height and width will be updated.
const ASPECT_RATIO = 16/9;
const minHeight = 300;
const minWidth = 300;
let height = minHeight;
let width = height*ASPECT_RATIO;

// values for all forces
// https://www.youtube.com/watch?v=JAe7Oscsp98
const forceProperties = {
    center: {
        enabled: false,
        x: 0.5,
        y: 0.5,
        strength: 0.1
    },
    charge: {
        enabled: true,
        strength: -500,
        distanceMin: 1,
        distanceMax: 1000
    },
    collide: {
        enabled: true,
        strength: .4,
        iterations: 1,
        radius: 30
    },
    separation: {
        enabled: true,
        strength: 0.1,
        radius: (width + height) / 2.0 * 0.25,
        radiusFunc: (width, height) => (width + height) / 2.0 * 0.25
    },
    link: {
        enabled: true,
        strength: 0.9,
        iterations: 1,
        distanceFactor: 5
    },
    radial: {
        enabled: false,
        strength: 1,
        categoryRadius: [400, 300, 200, 1]
    }
};

const normalizeDistance = (x, xMin, xMax, minDist, maxDist) => {
    const dist = xMax + 1 - Math.min(xMax, x);
    return (dist - xMin) / (xMax - xMin) * (maxDist - minDist) + minDist;

}

const calculateCategoryCenters = (cats, r) => [...Array(cats).keys()].map(i => [width / 2 + Math.round(r * Math.cos(2 * Math.PI * i / cats)), height / 2 + Math.round(r * Math.sin(2 * Math.PI * i / cats))]);
const calculateCategoryCentersEllipse = (cats, a, b) => [...Array(cats).keys()].map(i => {
    const theta = i*Math.PI*2/cats;
    const x = width/2 + ((theta<Math.PI/2 || theta>Math.PI/2*3)?1:-1)*a*b/(Math.sqrt(b*b + a*a*Math.tan(theta)*Math.tan(theta)));
    const y = height/2 + (theta<Math.PI?1:-1)*a*b/(Math.sqrt(a*a + b*b/(Math.tan(theta)*Math.tan(theta))))
    return [ x, y ];
});

const updateForces = ({ simulation, maxDist }) => {
    // get each force by name and update the properties
    simulation.force("center")
        // @ts-ignore
        .x(width * forceProperties.center.x)
        .y(height * forceProperties.center.y)
        .strength(forceProperties.center.enabled ? forceProperties.center.strength : 0);
    simulation.force("charge")
        // @ts-ignore
        .strength(forceProperties.charge.strength * forceProperties.charge.enabled)
        .distanceMin(forceProperties.charge.distanceMin)
        .distanceMax(forceProperties.charge.distanceMax);
    simulation.force("collide")
        // @ts-ignore
        .strength(forceProperties.collide.strength * forceProperties.collide.enabled)
        .radius(forceProperties.collide.radius)
        .iterations(forceProperties.collide.iterations);

    const cat_centers = calculateCategoryCenters(4, forceProperties.separation.radius)
    simulation.force("forceX")
        // @ts-ignore
        .strength(forceProperties.separation.strength * forceProperties.separation.enabled)
        .x(d => cat_centers[d['category'] - 1][0]);
    simulation.force("forceY")
        // @ts-ignore
        .strength(forceProperties.separation.strength * forceProperties.separation.enabled)
        .y(d => cat_centers[d['category'] - 1][1]);

    simulation.force("r")
        // @ts-ignore
        .radius(d => forceProperties.radial.categoryRadius[d['category'] - 1])
        .strength(forceProperties.radial.strength * (forceProperties.radial.enabled ? 1 : 0));

    simulation.force("link")
        // @ts-ignore
        .distance(d => normalizeDistance(d.freq, 1, maxDist, 1, 50) * forceProperties.link.distanceFactor)
        .iterations(forceProperties.link.iterations)
        // @ts-ignore
        .strength(forceProperties.link.enabled ? simulation.force("link").strength() : 0);

    // updates ignored until this is run
    // restarts the simulation (important if simulation has already slowed down)
    simulation.alpha(ALPHA_INIT).alphaMin(ALPHA_MINVAL);
}


// @ts-ignore
const MainGraph = ({ vizApiUrl, apiUrl }) => {
    console.log("Module Loading");

    const simulation = d3.forceSimulation();

    simulation.stop()
        .force("link", d3.forceLink().id(d => d.id))
        .force("charge", d3.forceManyBody())
        .force("collide", d3.forceCollide())
        .force("center", d3.forceCenter())
        .force("forceX", d3.forceX())
        .force("forceY", d3.forceY())
        .force("r", d3.forceRadial(
            d => forceProperties.radial.categoryRadius[d['category'] - 1],
            width / 2,
            height / 2
        ));

    let maxDist = 100;

    const svgRef = React.useRef();
    // const [selectedNode, setSelectedNode] = React.useState(dummyData);
    let selectedNode = dummyData;
    const cleanUp = () => {
        // console.log('Clean up');
        // d3.select('g.linkgroup').remove();
        // d3.select('g.hullgroup').remove();
        // d3.select('g.nodegroup').remove();

        // d3.select(svgRef.current).select('g.everything').append('g').attr('class', 'hullgroup');
        // d3.select(svgRef.current).select('g.everything').append('g').attr('class', 'linkgroup');
        // d3.select(svgRef.current).select('g.everything').append('g').attr('class', 'nodegroup');
    };

    const subgraph = {
        nodes: [], links: []
    };

    const setSelectedNode = (d) => {
        selectedNode = d;
        cleanUp();
        d3UpdateFunc();
    };
    const updateNodeSuggestions = (d) => {
        setSelectedNode({
            ...selectedNode,
            nodes: { nodes: d }
        });
    };

    const nodeRadiusScale = {
        'linear': d3.scaleLinear().range([1, 30]),
        'log': d3.scaleLog().range([1, 30])
    }
    let selectedNodeRadiusScale = 'linear';

    const nodeRadiusScaleChanged = (val) => {
        selectedNodeRadiusScale = val;
        d3UpdateFunc();
    }

    const nodeWeightParams = {
        frequency: 1,
        hasSignificance: 1,
        avgSignificance: 1,
        avgImpactFactor: 1,
        maxImpactFactor: 1,
        pValue: 1,
    }


    const weightUpdated = async () => {
        if (Object.keys(nodeWeightParams).length === 0) return;
        const nodeWeightsResponse = await fetch(`${vizApiUrl}/noderadius`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                nodes: {
                    nodes: subgraph.nodes.map(d => d.id)
                },
                weights: {
                    weights: nodeWeightParams
                }
            })
        });
        const nodeWeights = await nodeWeightsResponse.json();
        nodeRadiusScale[selectedNodeRadiusScale].domain([
            Math.min(...Object.values(nodeWeights)),
            Math.max(...Object.values(nodeWeights))
        ]);
        for (let i = 0; i < subgraph.nodes.length; i++) {
            subgraph.nodes[i]['weight_radius'] = +nodeWeights[subgraph.nodes[i].id];
        }
    }
    const weightChanged = (weight) => {
        Object.assign(nodeWeightParams, weight);
        weightUpdated();
        d3UpdateFunc();
    }
    let nodeSelection = {
        first: null
    };

    const processCytoscapeGraph = (graph) => {
        const nodes = graph.filter(d => !d.data.hasOwnProperty('source')).map(d => d.data);
        const links = graph.filter(d => d.data.hasOwnProperty('source')).map(d => d.data);

        return {
            nodes: subgraph.nodes.filter(node => nodes.map(d => d.id).includes(node.id)),
            links: links
        };
    }


    const getSankeyGraph = (graph, node1, node2) => {
        const nodes = [{id:node1}, {id:node2}];
        graph.links.forEach(link => {
            if(link.source === node1 && link.target === node2) {
                if(link.polarity === "Positive")
                    nodes.push({...link, id: "rightPos"})
                else if(link.polarity === "Neutral")
                    nodes.push({...link, id: "rightNeu"})
                else if(link.polarity === "Negative")
                    nodes.push({...link, id: "rightNeg"})
            }
            else if(link.source === node2 && link.target === node1) {
                if(link.polarity === "Positive")
                    nodes.push({...link, id: "leftPos"})
                else if(link.polarity === "Neutral")
                    nodes.push({...link, id: "leftNeu"})
                else if(link.polarity === "Negative")
                    nodes.push({...link, id: "leftNeg"})
            }
        })
        const edges = graph.links.filter(d => !d.id.startsWith("cluster_")).map(edge => {
            const valueAccessor = (d) => d.freq;
            if(edge.source === node1) {
                if(edge.polarity === "Negative") {
                    return [
                        { source:node1, target:"rightNeg", value:valueAccessor(edge) },
                        { source:"rightNeg", target:node2, value:valueAccessor(edge) },
                    ]
                }
                else if(edge.polarity === "Neutral") {
                    return [
                        { source:node1, target:"rightNeu", value:valueAccessor(edge) },
                        { source:"rightNeu", target:node2, value:valueAccessor(edge) },
                    ]
                }
                else if(edge.polarity === "Positive") {
                    return [
                        { source:node1, target:"rightPos", value:valueAccessor(edge) },
                        { source:"rightPos", target:node2, value:valueAccessor(edge) },
                    ]
                }
            }
            else if(edge.source === node2) {
                if(edge.polarity === "Negative") {
                    return [
                        { source:node1, target:"leftNeg", value:valueAccessor(edge) },
                        { source:"leftNeg", target:node2, value:valueAccessor(edge) },
                    ]
                }
                else if(edge.polarity === "Neutral") {
                    return [
                        { source:node1, target:"leftNeu", value:valueAccessor(edge) },
                        { source:"leftNeu", target:node2, value:valueAccessor(edge) },
                    ]
                }
                else if(edge.polarity === "Positive") {
                    return [
                        { source:node1, target:"leftPos", value:valueAccessor(edge) },
                        { source:"leftPos", target:node2, value:valueAccessor(edge) },
                    ]
                }
            }
        }).flat();
        return { nodes: nodes, links: edges };
    };

    const currentView = {
        "view": "root"
    }

    const relationViewSimulation = d3.forceSimulation();
    relationViewSimulation.stop()
        .force("link", d3.forceLink().id(d => d.id).strength(0))
        .force("forceX", d3.forceX())
        .force("forceY", d3.forceY());
        

    let setEvidenceData = null;
    const evidenceDataChanged = (dataFromChild) => {
        setEvidenceData = dataFromChild;
    };
    
    const clickedOnRelation = async (node1, node2) => {
        simulation.stop();

        const transitionSpeed = 750;
        const depGraphResponse = await fetch(`${apiUrl}/interaction/${node1}/${node2}/true`);
        const depGraph = processCytoscapeGraph(await depGraphResponse.json());
        
        const relationalNodeSepDist = 800;
        const relationalMaxHeight = 400;

        // Add the relational Edges
        const sankeyGraphData = getSankeyGraph(depGraph, node1, node2);
        const nodeOrder = {
            "rightPos": 0,
            "rightNeu": 1,
            "rightNeg": 2,
            "leftPos": 3,
            "leftNeu": 4,
            "leftNeg": 5
        }
        const sankeyGraph = sankey()
            .nodeId(d => d.id)
            .nodeAlign(d => {
                if(d.id === node1) return 0;
                if(d.id === node2) return 2;
                return 1;
            })
            .nodeSort((a, b) => {
                nodeOrder[node1] = -2;
                nodeOrder[node2] = -1;
                return nodeOrder[a] - nodeOrder[b];
            })
            .nodeWidth(1)
            .nodePadding(1000000)
            .extent([
                [width/2 - relationalNodeSepDist/2, height/2-relationalMaxHeight/2],
                [width/2 + relationalNodeSepDist/2, height/2+relationalMaxHeight/2]
            ])(sankeyGraphData);

        const node1Loc = {
            x: sankeyGraph.nodes.find(node => node.id === node1).x0,
            y: sankeyGraph.nodes.find(node => node.id === node1).y0
        }
        const node2Loc = {
            x: sankeyGraph.nodes.find(node => node.id === node2).x0,
            y: sankeyGraph.nodes.find(node => node.id === node2).y0
        }

        const heightScale = d3.scaleLinear()
            .range([10, nodeRadiusScale[selectedNodeRadiusScale].range()[1]])
            .domain([
                Math.min(...sankeyGraph.links.map(val => val.value)),
                Math.max(...sankeyGraph.links.map(val => val.value)),
            ])
        const rectWidth = 200;

        const node = d3.select("g.relationview g.relationnodes").selectAll(".sankeyNode")
            .data(sankeyGraph.nodes)
            .enter().append("g")
                .attr("class", "sankeyNode")
                .classed("original", d => d.id === node1 || d.id === node2)
                .classed("fake", d => d.id !== node1 && d.id !== node2)
                .attr("transform", d => `translate(${d.x0-rectWidth/2}, ${d.y0-heightScale(d.value)/2})`);
        const originalNodes = d3.select("g.relationnodes").selectAll(".original");
        const fakeNodes = d3.select("g.relationnodes").selectAll(".fake");

        const influenceLinkColors = [
            { id:"Pos", value: "#4bb543"},
            { id:"Neu", value: "grey"},
            { id:"Neg", value: "#ff8484"},
        ];

        const influenceNodeColors = [
            { id:"Pos", value: "#5cc654"},
            { id:"Neu", value: "lightgrey"},
            { id:"Neg", value: "#ff9595"},
        ]

        const getLinkColor = (data, colors) => {
            let interNode = data.source.id===node1?data.target:data.source;
            return colors.find(color => color.id === interNode.id.substring(interNode.id.length-3)).value;
        }
        const getNodeColor = (data, colors) => colors.find(color => color.id===data.id.substring(data.id.length-3)).value;

        fakeNodes.append("path")
            .attr("class", "relationarrow")
            .attr("transform", d => `translate(70, 0),scale(80,${Math.max(30, heightScale(d.value))})`)
            .attr("d", d => {
                if(d.id === node1 || d.id === node2) return "";
                if(d.id.startsWith("right"))
                    return "M 0 0 h 1 l 0.5 0.5 l -0.5 0.5 h -1 Z";
                if(d.id.startsWith("left"))
                    return "M 0 0 h 1 v 1 h -1 l -0.5 -0.5 Z";
            })
            .attr("fill", d => getNodeColor(d, influenceNodeColors))
            .on("mouseover", e => {
                d3.select(e.target.parentNode).classed("hovered", true);
            })
            .on("mouseout", e => {
                d3.select(e.target.parentNode).classed("hovered", false);
            })
            .on("click", e => {
                const eData = d3.select(e.target.parentNode).data()[0];
                setEvidenceData({
                    source: eData.source,
                    target: eData.target,
                    polarity: eData.polarity
                });
            })

        const text = fakeNodes.append("text")
            .attr("x", rectWidth/2)
            .attr("y", -5)
            .attr("dominant-baseline", "text-top")
            .attr("text-anchor", "left")
            .attr("transform", "translate(0, 0)")

        text.append("tspan")
            .attr("x", rectWidth/2)
            .attr("dy", "1.4em")
            .text(d => `F: ${d.freq}`)
        // We can add more text by appending more tspan
        // ...


        const link = d3.select("g.relationview g.relationlinks")
            // .attr("transform", d => `translate(${10}, ${10})`)
            .attr("fill", "none")
            .attr("stroke-opacity", 0.5)
            .style("mix-blend-mode", "multiply")
            .selectAll(".sankeylink")
                .data(sankeyGraph.links)
                .enter().append("path")
                    .attr("class", "sankeylink")
                    .attr("d", sankeyLinkHorizontal())
                    .attr("stroke", d => getLinkColor(d, influenceLinkColors))
                    .style("stroke-width", d => heightScale(d.value));


        const svgDirLegends = d3.select('g.relationlegends')
            .attr('transform', `translate(${width - 200},450)`);

        const addLegendTitle = (group, legendTitle, legendClass) => {
            group.selectAll("." + legendClass).data([1]).join(
                enter => enter
                    .append("text")
                    .attr("class", legendClass)
                    .text(legendTitle)
                    .attr("x", 0)
                    .attr("y", 0)
                    .attr("text-anchor", "left")
                    .style("alignment-baseline", "middle")
                    .attr('text-decoration', "underline"),
                update => update
                    .text(legendTitle)
                    .attr("x", 0)
                    .attr("y", 0),
                exit => exit.remove()
            )
        };

        addLegendTitle(svgDirLegends, "Influence", "influence");

        const legendTitleHeight = 20;

        const legendSquareSize = 20;
        svgDirLegends.selectAll('rect')
            .data(influenceLinkColors)
            .enter()
            .append('rect')
            .attr('x', 0)
            .attr('y', (d, i) => i * (legendSquareSize + 5) + legendTitleHeight)
            .attr('width', legendSquareSize)
            .attr('height', legendSquareSize)
            .style('fill', d => d.value)
            .attr("stroke", "black");

        svgDirLegends.selectAll('.colorlabel')
            .data(influenceLinkColors)
            .enter()
            .append("text")
            .attr("class", "colorlabel")
            .attr("x", legendSquareSize * 1.2)
            .attr("y", (d, i) => i * (legendSquareSize + 5) + (legendSquareSize / 2) + legendTitleHeight)
            .style("fill", d => d.value)
            .text(d => d.id)
            .attr("text-anchor", "left")
            .style("alignment-baseline", "middle");

        d3.select("g.relationview g.relationlinks").transition().duration(transitionSpeed).style("opacity",1);
        d3.select("g.relationview g.relationnodes").transition().duration(transitionSpeed).style("opacity",1);

        relationViewSimulation.nodes(subgraph.nodes);
        relationViewSimulation.force("link").links(subgraph.links);

        const oldCatCenters = calculateCategoryCenters(4, forceProperties.separation.radius)
        const newCatCenters = calculateCategoryCentersEllipse(4, relationalNodeSepDist+60, relationalMaxHeight + 80);
        const catTransition = newCatCenters.map((center, idx) => [center[0] - oldCatCenters[idx][0], center[1] - oldCatCenters[idx][1]]);
        
        const getForceX = (d) => d.x + catTransition[d.category-1][0];
        const getForceY = (d) => d.y + catTransition[d.category-1][1];
        relationViewSimulation.force("forceX").strength(0.1)
            .x(d => {
                if(d.id === node1) return node1Loc.x;
                if(d.id === node2) return node2Loc.x;
                return getForceX(d);
            });
        relationViewSimulation.force("forceY").strength(0.1)
            .y(d => {
                if(d.id === node1) return node1Loc.y;
                if(d.id === node2) return node2Loc.y;
                return getForceY(d);
            });

        relationViewSimulation.on("tick", () => {
            d3.selectAll("g.line").selectAll('line')
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            d3.selectAll("g.line").selectAll('text')
                .attr('x', d => d.target.x + 20)
                .attr('y', d => d.target.y + 20);

            d3.select("g.nodegroup").selectAll("g.node")
                .attr('transform', d => {
                    return `translate(${d.x},${d.y})`
                });
        })

        relationViewSimulation.alpha(ALPHA_INIT).alphaTarget(ALPHA_TARGET).restart();

        // Hide hulls and links
        d3.selectAll("g.hullgroup").style("opacity", 0).transition().duration(transitionSpeed).on("end", () => {
            d3.selectAll("g.hullgroup").style("display", "none");
        });
        // d3.selectAll("g.linkgroup").style("opacity", 0).transition().duration(transitionSpeed).on("end", () => {
        //     d3.selectAll("g.linkgroup").style("display", "none");
        // });

        
        // Initialize back button
        const backbtn = d3.select(".ui .backbtn");
        backbtn.style("opacity", 0).style("display", "inline-block").transition().duration(transitionSpeed*2).style("opacity", 1);
        backbtn.on("click", () => {
            // Update view state
            currentView.view = "root";

            d3.selectAll("g.hullgroup").style("display", "inline-block");
            d3.selectAll("g.linkgroup").style("display", "inline-block");

            d3.selectAll("g.hullgroup").style("opacity", 1);
            // d3.selectAll("g.linkgroup").style("opacity", 1);

            relationViewSimulation.stop();
            simulation.alpha(ALPHA_INIT).restart();


            d3.select("g.relationview g.relationlinks").transition().duration(transitionSpeed).style("opacity",0).on("end", () => {
                d3.select("g.relationview g.relationlinks").html("");
            });
            d3.select("g.relationview g.relationnodes").transition().duration(transitionSpeed).style("opacity",0).on("end", () => {
                d3.select("g.relationview g.relationnodes").html("");
            });

            backbtn.transition().duration(transitionSpeed*2).style("opacity", 0).on("end", () => {backbtn.style("display", "none")});

            // remove legends
            d3.select("g.relationlegends").html("");
        });
        // Update the view state
        currentView.view = "relation";
    }


    const d3UpdateFunc = async () => {
        // This is not actually an effect, but it works like an effect as it is run after component is mounted and rendered.
        console.log("effect called");
        if (selectedNode.nodes.nodes.length === 0) {
            setSelectedNode(dummyData);
            return;
        }

        simulation.stop();
        // if(currentView.view === "relation") relationViewSimulation.stop();

        const svgRoot = d3.select(svgRef.current);
        const svg = d3.select(svgRef.current).select("g.everything");
        const svgHullGroup = svg.select('g.hullgroup');
        const svgLinkGroup = svg.select('g.linkgroup');
        const svgNodeGroup = svg.select('g.nodegroup');

        height = Math.max(parseInt(svgRoot.style("height")), minHeight);
        width = Math.max(parseInt(svgRoot.style("width")), minWidth);
        forceProperties.separation.radius = forceProperties.separation.radiusFunc(width, height);

        svgHullGroup
            .selectAll('path')
            .data([{ category: 1 }, { category: 2 }, { category: 3 }, { category: 4 }], d => d.category)
            .enter()
            .append('path')
            .attr('class', d => 'hull_' + (d.category));

        const newSubgraphResponse = await fetch(`${vizApiUrl}/getbestsubgraph`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(selectedNode)
        });
        const newSubgraph = await newSubgraphResponse.json();

        const newNodes = [];
        const newLinks = [];
        for (let i in newSubgraph.nodes) {
            const myNode = subgraph.nodes.findIndex(node => node.id === newSubgraph.nodes[i].id)
            if (myNode !== -1) {
                newNodes.push({
                    ...subgraph.nodes[myNode],
                    ...newSubgraph.nodes[i]
                });
            }
            else {
                newNodes.push({
                    ...newSubgraph.nodes[i],
                    x: width / 2,
                    y: height / 2,
                });
            }
        }
        for (let i in newSubgraph.links) {
            const myEdge = subgraph.links.findIndex(edge => edge.source.id === newSubgraph.links[i].source && edge.target.id === newSubgraph.links[i].target)
            if (myEdge !== -1) {
                newLinks.push({
                    ...subgraph.links[myEdge],
                    ...newSubgraph.links[i]
                });
            }
            else {
                newLinks.push(newSubgraph.links[i]);
            }
        }
        subgraph.nodes = newNodes;
        subgraph.links = newLinks;

        const nodeWeightsResponse = await fetch(`${vizApiUrl}/noderadius`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                nodes: {
                    nodes: subgraph.nodes.map(d => d.id)
                },
                weights: {
                    weights: nodeWeightParams
                }
            })
        })
        const nodeWeights = await nodeWeightsResponse.json();

        nodeRadiusScale[selectedNodeRadiusScale].domain([
            Math.min(...Object.values(nodeWeights)),
            Math.max(...Object.values(nodeWeights))
        ]);
        for (let i = 0; i < subgraph.nodes.length; i++) {
            subgraph.nodes[i]['weight_radius'] = +nodeWeights[subgraph.nodes[i].id];
        }

        const link = svgLinkGroup
            .selectAll('g.line')
            .data(subgraph.links, d => d.source + d.target)
            .join(
                enter => {
                    const lineGroup = enter
                        .append('g')
                        .attr('class', d => "line " + idToClass(d.source) + " " + idToClass(d.target))
                        .classed('betweencategory', d => d['samecategory'])
                        .classed('intracategory', d => !d['samecategory']);
                    lineGroup.append("text")
                        .text(d => d.freq);
                    lineGroup.append("line")
                        .on('mouseover', (e) => {
                            if(currentView.view !== "root") return;
                            if(nodeSelection.first) return;
                            const line = d3.select(e.target.parentNode).classed('hovered', true);
                            const lineData = line.data();
                            d3.selectAll(`g#${idToClass(lineData[0].source.id)} circle`).classed('hovered', true);
                            d3.selectAll(`g#${idToClass(lineData[0].target.id)} circle`).classed('hovered', true);
                        })
                        .on('mouseout', (e) => {
                            if(currentView.view !== "root") return;
                            if(nodeSelection.first) return;
                            const line = d3.select(e.target.parentNode).classed('hovered', false);
                            const lineData = line.data();
                            d3.selectAll(`g#${idToClass(lineData[0].source.id)} circle`).classed('hovered', false);
                            d3.selectAll(`g#${idToClass(lineData[0].target.id)} circle`).classed('hovered', false);
                        })
                        .on('click', (e) => {
                            const line = d3.select(e.target.parentNode);
                            const lineData = line.data();
                            if(nodeSelection.first !== null && nodeSelection.first !== lineData[0].source.id && nodeSelection.first !== lineData[0].target.id) {
                                return;
                            }
                            clickedOnRelation(lineData[0].source.id, lineData[0].target.id);
                        });

                    return lineGroup;
                },
                update => update,
                exit => exit.remove()
            );

        const categoryNodeColors = {
            3: "#8a2a44",
            4: "#10712b",
            1: "#411c58",
            2: "#00308e",
        }

        const shortenText = (t) => {
            if (t.length <= 15) return t;
            return t.substring(0, 7) + '...' + t.substring(t.length-3)
        };

        const node = svgNodeGroup
            .selectAll("g.node")
            .data(subgraph.nodes, d => d.id)
            .join(
                enter => {
                    const nodeGroup = enter
                        .append("g")
                        .classed("node", true)
                        .classed("pinned", d => d['pinned'])
                        .attr('id', d => idToClass(d.id));

                    nodeGroup.append("text")
                        .text(d => shortenText(d["label"]))
                        .attr('x', 40)
                        .attr('y', 0)
                        .on("mouseover", e => {
                            d3.select(e.target).text(d => d['label'])
                        })
                        .on("mouseout", e => {
                            d3.select(e.target).text(d => shortenText(d['label']))
                        });
                    // node tooltip
                    nodeGroup.append("title")
                        .text(d => d.id);

                    nodeGroup.append("circle")
                        .attr('r', d => nodeRadiusScale[selectedNodeRadiusScale](d.weight_radius))
                        .attr('stroke', d => categoryNodeColors[d.category])
                        .attr('fill', d => categoryNodeColors[d.category])
                        .on('mouseover', (e) => {
                            // if(currentView.view !== "root") return;
                            const circle = d3.select(e.target).classed('hovered', true);
                            const nodeId = circle.data()[0].id;
                            d3.selectAll('g.linkgroup g.' + idToClass(nodeId)).classed('hovered', true);

                            d3.selectAll('g.linkgroup g.' + idToClass(nodeId) + '.hovered text').classed('hovered', true);
                        })
                        .on('mouseout', (e) => {
                            // if(currentView.view !== "root") return;
                            const circle = d3.select(e.target).classed('hovered', false);
                            const nodeId = circle.data()[0].id;
                            d3.selectAll('g.linkgroup g.' + idToClass(nodeId) + '.hovered text').classed('hovered', false);
                            d3.selectAll('g.linkgroup g.' + idToClass(nodeId)).classed('hovered', false);

                        })
                        .on("click", (e) => {
                            if(currentView.view !== "root") return;
                            if(!nodeSelection.first) {
                                const circle = d3.select(e.target).classed('selected', true);
                                const nodeId = circle.data()[0].id;
                                nodeSelection.first = nodeId;

                                d3.selectAll('g.linkgroup g.' + idToClass(nodeId)).classed('largehovered', true);
                            }
                            else {
                                d3.select(".node circle.selected").classed("selected", false);
                                const circle = d3.select(e.target);
                                const nodeId = circle.data()[0].id;
                                d3.selectAll('g.linkgroup g.' + idToClass(nodeSelection.first)).classed('largehovered', false);
                                if(nodeId !== nodeSelection.first) {
                                    clickedOnRelation(nodeSelection.first, nodeId);
                                    nodeSelection.first = null;
                                }
                                else {
                                    nodeSelection.first = null;
                                }
                            }

                        })
                    nodeGroup
                        // @ts-ignore
                        .call(d3.drag()
                            .on("start", (event, d) => {
                                if(currentView.view !== "root") return;
                                if (!event.active) simulation.alpha(ALPHA_INIT).restart();
                                d.fx = d.x;
                                d.fy = d.y;

                            })
                            .on("drag", (event, d) => {
                                if(currentView.view !== "root") return;
                                d.fx = event.x;
                                d.fy = event.y;

                            })
                            .on("end", (event, d) => {
                                if(currentView.view !== "root") return;
                                if (!event.active) simulation.alpha(ALPHA_INIT);
                                delete d['fx']
                                delete d['fy']
                            }));

                    return nodeGroup;
                },
                update => {
                    const nodeGroup = update
                        .classed("pinned", d => d['pinned']);

                    nodeGroup.select('text')
                        .text(d => shortenText(d["label"]));
                    // node tooltip
                    nodeGroup.select("title")
                        .text(d => d.id);


                    nodeGroup.select("circle")
                        .attr('r', d => nodeRadiusScale[selectedNodeRadiusScale](d.weight_radius))
                        .attr('stroke', d => categoryNodeColors[d.category]);

                    return nodeGroup;
                },
                exit => exit.remove()
            );


        simulation.nodes(subgraph.nodes);
        maxDist = Math.max(...subgraph.links.map(link => link.freq));

        simulation.force("link").links(subgraph.links);

        updateForces({ simulation, maxDist });

        simulation.on("tick", () => {
            link.selectAll('line')
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            link.selectAll('text')
                .attr('x', d => d.target.x + 20)
                .attr('y', d => d.target.y + 20);

            node
                .attr('transform', d => `translate(${d.x},${d.y})`);

            const hullPoints = [];
            for (let i = 1; i <= 4; i++) {
                hullPoints.push({
                    category: i,
                    hulls: d3.polygonHull(subgraph.nodes.filter(d => d["category"] === i).map(d => [d.x, d.y]))
                });
            }

            const hullPadding = 25;
            for (let i = 1; i <= 4; i++) {
                if (hullPoints[i - 1].hulls) {
                    d3.select('.hull_' + i).attr('d', smoothHull(hullPoints[i - 1].hulls, hullPadding));
                }
            }

            const entropyBar = d3.select('#alpha_value').style('width', simulation.alpha() * 100 + "%");
            if (simulation.alpha() > 0.5) {
                entropyBar.classed("bg-danger", true).classed("bg-warning", false).classed("bg-success", false);
            }
            else if (simulation.alpha() > 0.2) {
                entropyBar.classed("bg-warning", true).classed("bg-danger", false).classed("bg-success", false);
            }
            else {
                entropyBar.classed("bg-warning", false).classed("bg-danger", false).classed("bg-success", true);
            }
        });

        d3.selectAll("g.intracategory line").style('opacity', d3.select("#interclusterEdgeOpacity").node().value);
        d3.select("#interclusterEdgeOpacity").on('change', (e) => {
            d3.selectAll("g.intracategory line").style('opacity', e.target.value);
        })
        d3.selectAll("g.betweencategory line").style('opacity', d3.select("#intraclusterEdgeOpacity").node().value);
        d3.select("#intraclusterEdgeOpacity").on('change', (e) => {
            d3.selectAll("g.betweencategory line").style('opacity', e.target.value);
        })
        d3.selectAll("g.node text").style('opacity', d3.select("#nodeLabelOpacity").node().value);
        d3.select("#nodeLabelOpacity").on('change', (e) => {
            d3.selectAll("g.node text").style('opacity', e.target.value);
        })
        nodeRadiusScale["linear"].range([1, d3.select("#maxRadius").node().value]);
        d3.selectAll("g.node circle").attr('r', d => nodeRadiusScale[selectedNodeRadiusScale](d.weight_radius));
        d3.select("#maxRadius").on('change', (e) => {
            nodeRadiusScale["linear"].range([1, e.target.value]);
            d3.selectAll("g.node circle").attr('r', d => nodeRadiusScale[selectedNodeRadiusScale](d.weight_radius));
        })

        d3.selectAll(".clusternodecount").on('change', (e) => {
            const categoryIds = ['cluster1count', 'cluster2count', 'cluster3count', 'cluster4count'];
            setSelectedNode({
                ...selectedNode,
                category_count: {
                    categorycount: {
                        "1": d3.select('#' + categoryIds[0]).property('value'),
                        "2": d3.select('#' + categoryIds[1]).property('value'),
                        "3": d3.select('#' + categoryIds[2]).property('value'),
                        "4": d3.select('#' + categoryIds[3]).property('value'),
                    }
                }
            });
        });

        // Legends
        const colors = [
            { id: "Protein", color: "#411c58" },
            { id: "Diseases", color: "#00308e" },
            { id: "Biological Process", color: "#8a2a44" },
            { id: "Chemical", color: "#10712b" },
        ];


        const svgColorLegends = d3.select('g.categorylegends')
            .attr('transform', `translate(${width - 200},25)`);


        const addLegendTitle = (group, legendTitle, legendClass) => {
            group.selectAll("." + legendClass).data([1]).join(
                enter => enter
                    .append("text")
                    .attr("class", legendClass)
                    .text(legendTitle)
                    .attr("x", 0)
                    .attr("y", 0)
                    .attr("text-anchor", "left")
                    .style("alignment-baseline", "middle")
                    .attr('text-decoration', "underline"),
                update => update
                    .text(legendTitle)
                    .attr("x", 0)
                    .attr("y", 0),
                exit => exit.remove()
            )
        };

        addLegendTitle(svgColorLegends, "Category Colors", "colorlegendtitle");

        const legendTitleHeight = 20;

        const legendSquareSize = 20;
        svgColorLegends.selectAll('rect')
            .data(colors)
            .enter()
            .append('rect')
            .attr('x', 0)
            .attr('y', (d, i) => i * (legendSquareSize + 5) + legendTitleHeight)
            .attr('width', legendSquareSize)
            .attr('height', legendSquareSize)
            .style('fill', d => d.color)
            .attr("stroke", "black");

        svgColorLegends.selectAll('.colorlabel')
            .data(colors)
            .enter()
            .append("text")
            .attr("class", "colorlabel")
            .attr("x", legendSquareSize * 1.2)
            .attr("y", (d, i) => i * (legendSquareSize + 5) + (legendSquareSize / 2) + legendTitleHeight)
            .style("fill", d => d.color)
            .text(d => d.id)
            .attr("text-anchor", "left")
            .style("alignment-baseline", "middle");

        const svgSizeLegends = d3.select('g.sizelegends')
            .attr('transform', `translate(${width - 200},200)`);
        const sizeLegendItemsCount = 3;

        const linspace = (start, stop, num, endpoint = true) => {
            const div = endpoint ? (num - 1) : num;
            const step = (stop - start) / div;
            return Array.from({ length: num }, (_, i) => start + step * i);
        }

        const legendSizeData = Array.from(linspace(nodeRadiusScale[selectedNodeRadiusScale].domain()[0], nodeRadiusScale[selectedNodeRadiusScale].domain()[1], sizeLegendItemsCount), (d, i) => ({
            id: i, value: d
        }))
        const legendMaxCircleSize = nodeRadiusScale[selectedNodeRadiusScale].range()[1];

        addLegendTitle(svgSizeLegends, "Weight Values", "radiuslegendtitle");

        svgSizeLegends.selectAll('.circleradiuslabel')
            .data(legendSizeData, d => d.id)
            .join(enter => enter
                .append('circle')
                .attr("class", "circleradiuslabel")
                .attr('cx', 0)
                .attr('cy', (d, i) => i * (legendMaxCircleSize * 2) + legendTitleHeight*2)
                .attr('r', d => nodeRadiusScale[selectedNodeRadiusScale](d.value))
                .style('fill', d => "grey")
                .attr("stroke", "black"),
                update => update
                    .attr('cy', (d, i) => i * (legendMaxCircleSize * 2) + legendTitleHeight*2)
                    .attr('r', d => nodeRadiusScale[selectedNodeRadiusScale](d.value)),
                exit => exit.remove()
            );

        svgSizeLegends.selectAll('.radiuslabel')
            .data(legendSizeData, d => d.id)
            .join(enter => enter
                .append("text")
                .attr("class", "radiuslabel")
                .attr("x", legendMaxCircleSize * 2)
                .attr("y", (d, i) => i * (legendMaxCircleSize * 2) + legendTitleHeight*2)
                .text(d => Math.round(d.value))
                .attr("text-anchor", "left")
                .style("alignment-baseline", "middle"),
                update => update
                    .attr("y", (d, i) => i * (legendMaxCircleSize * 2) + legendTitleHeight*2)
                    .text(d => Math.round(d.value)),
                exit => exit.remove()
            );
        


        d3.zoom().on("zoom", (e) => {
            svg.attr('transform', e.transform)
            // @ts-ignore
        })(svgRoot);

        // Start the normal simulation
        if(currentView.view === "root") simulation.restart();

        return cleanUp;
    }

    function debounce(func) {
        var timer;
        return function (event) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(func, 1000, event);
        };
    }

    window.addEventListener("resize", debounce((e) => {
        d3UpdateFunc();
    }));

    return (
        <>
            <div style={{
                display: "flex",
                flexDirection: "column",
            }}>
                <WeightPanel
                    updateWeightValues={weightChanged}
                    useButton={false}
                    buttonText={"Update Weight"}
                    initialUpdateCall={false}
                />
                <div style={{
                    display: "flex",
                    flexDirection: "row",
                }}>
                    <SidePanel currentView={{view: "root"}} simulation={simulation} maxDist={maxDist} apiUrl={vizApiUrl} updateNodeSuggestions={updateNodeSuggestions} nodeRadiusScaleChanged={nodeRadiusScaleChanged} forceProperties={forceProperties} updateForces={updateForces} />
                    <div style={{
                        width: "100%",
                        minWidth: "800px"
                    }}>
                        <main className="main-ui rsection" style={{
                                width: "100%",
                                maxHeight: "80vh",
                                aspectRatio: "4/3",
                                display: "flex",
                                position: "relative",
                                verticalAlign: "top",
                                overflow: "hidden",
                        }}>
                            <svg ref={svgRef} id="maingraph" className="fullsize" style={{
                                position: "absolute",
                                background: "white",
                            }}>
                                <g className="everything">
                                    <g className="relationview">
                                        <g className="relationlinks"></g>
                                        <g className="relationnodes"></g>
                                    </g>
                                    <g className="hullgroup"></g>
                                    <g className="linkgroup"></g>
                                    <g className="nodegroup"></g>
                                </g>
                                <g className="legendgroup" style={{
                                    outline: "1px solid black",
                                    outlineOffset: "10px"
                                }}>
                                    <g className="categorylegends" transform={`translate(${width - 200},25)`}></g>
                                    <g className="sizelegends" transform={`translate(${width - 200},160)`}></g>
                                    <g className="relationlegends" transform={`translate(${width-200},500)`}></g>
                                </g>
                                <g className="ui">
                                    <g transform="scale(0.4, 0.4),translate(100, 100)" className="backbtn" style={{
                                        position: "absolute"
                                    }}>
                                        <rect x="-15" y="-15" height="250" width="250" rx="10" ry="10" fill="white" />
                                        <path d="M109.576,219.151c60.419,0,109.573-49.156,109.573-109.576C219.149,49.156,169.995,0,109.576,0S0.002,49.156,0.002,109.575
                                            C0.002,169.995,49.157,219.151,109.576,219.151z M109.576,15c52.148,0,94.573,42.426,94.574,94.575
                                            c0,52.149-42.425,94.575-94.574,94.576c-52.148-0.001-94.573-42.427-94.573-94.577C15.003,57.427,57.428,15,109.576,15z"/>
                                        <path d="M94.861,156.507c2.929,2.928,7.678,2.927,10.606,0c2.93-2.93,2.93-7.678-0.001-10.608l-28.82-28.819l83.457-0.008
                                            c4.142-0.001,7.499-3.358,7.499-7.502c-0.001-4.142-3.358-7.498-7.5-7.498l-83.46,0.008l28.827-28.825
                                            c2.929-2.929,2.929-7.679,0-10.607c-1.465-1.464-3.384-2.197-5.304-2.197c-1.919,0-3.838,0.733-5.303,2.196l-41.629,41.628
                                            c-1.407,1.406-2.197,3.313-2.197,5.303c0.001,1.99,0.791,3.896,2.198,5.305L94.861,156.507z"/>
                                    </g>
                                </g>
                            </svg>
                        </main>
                    <EvidencePanelWrapper apiUrl={apiUrl} onDataChange={evidenceDataChanged}></EvidencePanelWrapper>
                    </div>
                </div>
            </div>
        </>
    )
};

export default MainGraph;