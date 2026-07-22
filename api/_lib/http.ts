export interface ApiRequest {
  method?: string
}

export interface ApiResponse {
  status(code: number): ApiResponse
  setHeader(name: string, value: string): void
  json(body: unknown): void
  end(): void
}

export function allowGet(request: ApiRequest, response: ApiResponse): boolean {
  response.setHeader('Allow', 'GET')
  if (request.method === 'GET' || request.method === 'HEAD') return true
  response.status(405).json({ error: 'Method not allowed' })
  return false
}
