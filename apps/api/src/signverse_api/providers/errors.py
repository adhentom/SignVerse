from typing import Literal

ProviderErrorCode = Literal["api_failure", "invalid_response", "rate_limit", "timeout"]


class InterpretationProviderError(Exception):
    def __init__(self, code: ProviderErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code


class InvalidProviderResponseError(InterpretationProviderError):
    def __init__(self) -> None:
        super().__init__("invalid_response", "The interpretation provider returned invalid data.")


class ProviderTimeoutError(InterpretationProviderError):
    def __init__(self) -> None:
        super().__init__("timeout", "The interpretation provider timed out.")


class ProviderRateLimitError(InterpretationProviderError):
    def __init__(self) -> None:
        super().__init__("rate_limit", "The interpretation provider rate limit was reached.")


class ProviderAPIError(InterpretationProviderError):
    def __init__(self) -> None:
        super().__init__("api_failure", "The interpretation provider request failed.")
