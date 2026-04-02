### Requirement: Per-request JSON Lines logging
The system SHALL append one JSON line per completed request to a configurable log file.

#### Scenario: Successful request logging
- **WHEN** a request to `/v1/chat/completions` completes successfully
- **THEN** the system SHALL append a JSON line with: timestamp, model, method, path, status (200), latency_ms, input_tokens, output_tokens

#### Scenario: Failed request logging
- **WHEN** a request fails with an error status (4xx, 5xx)
- **THEN** the system SHALL append a JSON line with: timestamp, model (if resolved), method, path, status, latency_ms, error message

#### Scenario: Default log path
- **WHEN** no `logPath` is configured
- **THEN** the system SHALL log to `~/.pi/model-proxy-log.jsonl`

#### Scenario: Custom log path
- **WHEN** `logPath` is set in config
- **THEN** the system SHALL log to the specified path

### Requirement: Log file creation
The system SHALL create the log file and parent directories if they do not exist.

#### Scenario: First request with no existing log file
- **WHEN** the first request completes and the log file does not exist
- **THEN** the system SHALL create the file and write the log entry
