""" PyDantic model for the weights observation record"""
from typing import List, Optional, Mapping

from pydantic import BaseModel

# These models are data structures for the internal API, not meant to model DB


class Coefficient(BaseModel):
    name: str
    value: float


class UserRecord(BaseModel):
    query_str: str
    coefficients: List[Coefficient]


class EvidenceItem(BaseModel):
    sentence: str
    list_item: str
    impact: str
    hyperlink: str
    markup: str
    labels: Optional[Mapping[str, bool]]

    def __hash__(self):
        return hash((self.sentence, self.list_item, self.impact))

class EvidenceSentence(BaseModel):
    sentence: str

class EvidenceLabels(BaseModel):
    sentence: str
    labels: Mapping[str, bool]

