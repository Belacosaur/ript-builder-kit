# Framework-free treasury dashboard

Serve these files with the adjacent `server` example; follow its README. `main.js` imports only the packed browser SDK and chooses an explicit environment. It calls `treasury.get()` and `treasury.activity.list()`, displays exact string base units and retains unknown observations as unknown. No credentials, project paths or treasury address are embedded. Change the environment in `main.js` together with the server environment.
