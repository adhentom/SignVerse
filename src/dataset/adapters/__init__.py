"""Dataset-specific adapter contracts."""

from .cislr_adapter import CISLRDatasetAdapter
from .include_adapter import INCLUDEDatasetAdapter
from .isign_adapter import ISignDatasetAdapter
from .isl_csltr_adapter import ISLCSLTRDatasetAdapter
from .mudra_adapter import MUDRADatasetAdapter
from .nish_adapter import NISHDatasetAdapter

__all__ = [
    "CISLRDatasetAdapter",
    "INCLUDEDatasetAdapter",
    "ISignDatasetAdapter",
    "ISLCSLTRDatasetAdapter",
    "MUDRADatasetAdapter",
    "NISHDatasetAdapter",
]
