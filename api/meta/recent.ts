import metaSnapshot from '../../data/recent-pro-meta.json'
import { allowGet, type ApiRequest, type ApiResponse } from '../_lib/http.js'

export default function handler(request: ApiRequest, response: ApiResponse) {
  if (!allowGet(request, response)) return

  response.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400')
  response.setHeader('X-DraftGG-Data-Source', 'bundled')
  if (request.method === 'HEAD') return response.status(200).end()
  response.status(200).json(metaSnapshot)
}
