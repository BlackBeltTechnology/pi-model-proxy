## ADDED Requirements

### Requirement: Request timeout
The system SHALL abort upstream provider calls when a configurable timeout is exceeded.

#### Scenario: Request exceeds timeout
- **WHEN** a request has been processing longer than `requestTimeoutMs` (default: 120000)
- **THEN** the system SHALL abort the upstream provider call and return 504 Gateway Timeout (if headers not yet sent) or close the SSE stream

#### Scenario: Custom timeout configuration
- **WHEN** `requestTimeoutMs` is set to 30000 in config
- **THEN** requests SHALL timeout after 30 seconds

### Requirement: Client disconnect detection
The system SHALL detect client disconnection and propagate cancellation to upstream provider calls.

#### Scenario: Client disconnects during streaming
- **WHEN** a client closes the connection while an SSE stream is active
- **THEN** the system SHALL abort the upstream provider call via AbortSignal

#### Scenario: Client disconnects during non-streaming
- **WHEN** a client closes the connection while waiting for a non-streaming response
- **THEN** the system SHALL abort the upstream provider call via AbortSignal

### Requirement: AbortSignal propagation
The system SHALL create an AbortController per request and pass its signal to `streamSimple()`.

#### Scenario: Signal passed to provider
- **WHEN** a chat completion request is processed
- **THEN** an AbortSignal SHALL be included in the `streamSimple()` options

#### Scenario: Combined abort sources
- **WHEN** either the timeout fires or the client disconnects
- **THEN** the same AbortSignal SHALL be triggered, cancelling the upstream call
