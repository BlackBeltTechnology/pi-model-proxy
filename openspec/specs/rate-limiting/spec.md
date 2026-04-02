### Requirement: Sliding window rate limiting
The system SHALL enforce a configurable per-minute request cap using a sliding window algorithm.

#### Scenario: Under rate limit
- **WHEN** the number of requests in the past 60 seconds is below the configured `rateLimit`
- **THEN** the request SHALL be processed normally

#### Scenario: At rate limit
- **WHEN** the number of requests in the past 60 seconds equals or exceeds the configured `rateLimit`
- **THEN** the server SHALL respond with 429 and include a `Retry-After` header with seconds until the window clears

#### Scenario: Rate limit disabled
- **WHEN** no `rateLimit` is configured or it is set to 0
- **THEN** no rate limiting SHALL be applied

### Requirement: Rate limit applies to API endpoints only
Rate limiting SHALL apply to `/v1/chat/completions`, `/v1/messages`, and `/v1/models` but not to `/health`.

#### Scenario: Health check exempt
- **WHEN** a `GET /health` request arrives while rate limit is exceeded
- **THEN** the server SHALL respond normally with 200

#### Scenario: API endpoint rate limited
- **WHEN** a `POST /v1/chat/completions` request arrives while rate limit is exceeded
- **THEN** the server SHALL respond with 429
