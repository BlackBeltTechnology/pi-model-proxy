### Requirement: HTTP server lifecycle management
The extension SHALL create an HTTP server on the configured port at extension load time. The server SHALL shut down gracefully when `session_shutdown` fires, completing in-flight requests before closing.

#### Scenario: Server starts on extension load
- **WHEN** the extension is loaded by pi
- **THEN** an HTTP server SHALL begin listening on the configured port

#### Scenario: Server shuts down on session end
- **WHEN** `session_shutdown` event fires
- **THEN** the server SHALL stop accepting new connections and close after in-flight requests complete

### Requirement: CORS support
The server SHALL handle CORS preflight requests and set appropriate headers based on configuration.

#### Scenario: OPTIONS preflight request
- **WHEN** a client sends an OPTIONS request to any endpoint
- **THEN** the server SHALL respond with 204 and include `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, and `Access-Control-Allow-Headers` headers

#### Scenario: Configured allowed origins
- **WHEN** `allowedOrigins` is set in config to `["http://localhost:3000"]`
- **THEN** the `Access-Control-Allow-Origin` header SHALL be set to `http://localhost:3000`

### Requirement: API key authentication
The server SHALL enforce Bearer token or `x-api-key` header authentication when an `apiKey` is configured.

#### Scenario: Valid API key via Bearer token
- **WHEN** a request includes `Authorization: Bearer <valid-key>` and `apiKey` is configured
- **THEN** the request SHALL be processed normally

#### Scenario: Valid API key via x-api-key header
- **WHEN** a request includes `x-api-key: <valid-key>` header and `apiKey` is configured
- **THEN** the request SHALL be processed normally

#### Scenario: Missing API key
- **WHEN** a request has no Authorization or x-api-key header and `apiKey` is configured
- **THEN** the server SHALL respond with 401 and an error message

#### Scenario: Invalid API key
- **WHEN** a request includes an incorrect Bearer token and `apiKey` is configured
- **THEN** the server SHALL respond with 401 and an error message

#### Scenario: No API key configured
- **WHEN** no `apiKey` is set in config
- **THEN** all requests SHALL be processed without authentication checks

### Requirement: Request routing
The server SHALL route requests to the appropriate handler based on method and path.

#### Scenario: Known endpoint
- **WHEN** a request matches a registered route (e.g., `POST /v1/chat/completions`)
- **THEN** the server SHALL dispatch to the corresponding handler

#### Scenario: Unknown endpoint
- **WHEN** a request does not match any registered route
- **THEN** the server SHALL respond with 404 and an error message

### Requirement: Graceful startup before model registry
The server SHALL return 503 with `Retry-After: 1` for model-dependent requests received before the model registry is available.

#### Scenario: Request before session_start
- **WHEN** a `POST /v1/chat/completions` request arrives before `session_start` has fired
- **THEN** the server SHALL respond with 503 and include a `Retry-After: 1` header

#### Scenario: Health check before session_start
- **WHEN** a `GET /health` request arrives before `session_start` has fired
- **THEN** the server SHALL respond with 200 (health check does not require model registry)
