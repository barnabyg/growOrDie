# Static web app, state in localStorage

The game ships as a static web page with no backend; all game state persists in the browser's localStorage and auto-saves after each resolved turn. Chosen over a server-backed app to keep v1 shippable as a folder of files and put all effort into simulation balance and feel. Multiplayer, accounts, and leaderboards are explicitly out of scope.
