# Voice input

Transcription edits a composer draft. It does not submit an agent turn. Audio is
temporary client input, and only normal message submission sends the resulting
text. The client-runtime controller owns the operation while an application
supplies capture and transcription.

Preparation binds the transcriber and resolved locale for the whole recording.
Draft ownership, text, and revision are captured before recording and checked
before insertion, so a late transcript cannot overwrite a draft that was edited
or replaced.

Cancellation invalidates a result immediately, but resources stay owned until
the underlying work settles. Releasing a session or deleting its recording when
the abort signal fires would race that work. The [transcription contract](../../packages/client-runtime/src/voice-input/transcription.ts)
therefore requires implementations to settle only after their work has stopped
and to discard late results.
