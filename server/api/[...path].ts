// Unknown /api/* paths answer 404 JSON instead of falling through to the SPA's index.html, so a client
// calling a removed or mistyped endpoint gets an error rather than a 200 HTML page. Not generated.
export default defineEventHandler((event) => {
  setResponseStatus(event, 404)
  return { error: 'Not found' }
})
