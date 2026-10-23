# BoxAPI (boxapi.ir): LLM gateway

OpenAI-compatible gateway to many models.

- Base URL: `https://ai.boxapi.ir/ai/v1` (env `BOXAPI_BASE_URL`)
- Auth: `Authorization: Bearer <key>` (env `BOXAPI_API_KEY`). Server-side only; never expose it to the browser.
- **Confirmed endpoints:** `/chat/completions` (use this), `/responses`, `/embeddings`, streaming via `stream: true`, and `/audio/transcriptions` (below).
- Model ids come from env: `LLM_MODEL` (default `gpt-5.4-mini`), `LLM_FALLBACK_MODEL`, `STT_MODEL`. Never hard-code them.

## Speech to text (confirmed from BoxAPI docs)
Endpoint `POST https://ai.boxapi.ir/ai/v1/audio/transcriptions`, multipart form (same as OpenAI):
```bash
curl https://ai.boxapi.ir/ai/v1/audio/transcriptions \
  -H "Authorization: Bearer $BOXAPI_API_KEY" \
  -F "model=$STT_MODEL" \
  -F "file=@audio.mp3"
```
- Supported input formats and languages **depend on the model**. The docs don't list model ids.
- Add `-F language=fa` (and `-F response_format=json`) if the model accepts it.
- `npm run doctor` tries `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, `whisper-1` in that order with a short Persian clip in **both** `audio/webm;codecs=opus` (Chrome/Android) and `audio/mp4` (Safari/iOS). It writes the first model that works into `.env.local` as `STT_MODEL`. If webm fails but mp3/wav works, the server converts the upload with `ffmpeg` (add it to the Docker image).
- In the app: `/api/transcribe` forwards the browser's blob with the correct filename extension (`.webm`, `.mp4`, `.m4a`); the extension matters to OpenAI-style endpoints.

## Chat in this project
- Use the Vercel AI SDK with `@ai-sdk/openai-compatible` (`createOpenAICompatible({ name: 'boxapi', baseURL, apiKey })`).

## NOT confirmed: `npm run doctor` must test each one and print a table
1. **Tool calling** (`tools` + `tool_choice`) for `LLM_MODEL`
2. **`response_format: json_object` / `json_schema`**
3. **`temperature`** being passed through (some reasoning models reject it)
4. Typical latency

## How we call it, whatever the doctor says
- Ask for JSON only, put the JSON shape in the system prompt, and validate with zod.
- If the JSON is invalid, retry once with the validation error appended. After that, fall back to the scripted/deterministic answer.
- Timeout: 20 s for chat and 30 s for transcription. If the primary model fails, try `LLM_FALLBACK_MODEL` once.
- Log model, latency, and whether the fallback was used to stdout (one JSON line per call). Never log the key.
