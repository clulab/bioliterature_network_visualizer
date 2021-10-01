from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Numeric, Float, TIMESTAMP, func
from sqlalchemy.orm import relationship

from .database import Base

class Variable(Base):
    __tablename__ = "variables"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)

    instances = relationship("Record", back_populates="variable")

class RecordMetadata(Base):
    __tablename__ = "record_metadata"
    id = Column(Integer, primary_key=True, index=True)
    commit = Column(String)
    query_str = Column(String)
    graph_name = Column(String)
    graph_hash = Column(String)
    rankings_name = Column(String)
    rankings_hash = Column(String)
    timestamp = Column(TIMESTAMP, default=func.now())
    extra = Column(String, nullable=True)

    records = relationship("Record", back_populates = "meta_data")

class Record(Base):
    __tablename__ = "records"

    id = Column(Integer, primary_key=True, index=True)
    variable_id = Column(Integer, ForeignKey("variables.id"))
    value = Column(Float)
    metadata_id = Column(Integer, ForeignKey("record_metadata.id"))

    variable = relationship("Variable", back_populates = "instances")
    meta_data = relationship("RecordMetadata", back_populates = "records")