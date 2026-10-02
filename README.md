# Qr-code-scanner-

QR Café Realtime MVP
Real-time customer → kitchen ordering prototype.
What changed
Orders are sent to a shared server instead of browser LocalStorage.
WebSocket broadcasts new orders and status changes to connected clients instantly.
PostgreSQL is used automatically when DATABASE_URL exists; otherwise the app uses in-memory storage for local testing.
Responsive UI works across phone, tablet and laptop widths.
/health reports real-time and database status.
Run locally
npm install npm start
Open two browser windows: customer and Admin. Place an order in one; it appears in the other without refresh.
Railway
Set DATABASE_URL to the Railway PostgreSQL connection string. The server will create the orders table automatically on startup.
Production next
Admin authentication / roles
QR table URLs
PostgreSQL menu/table/user schema
Razorpay server-side payment verification
Customer order tracking
Push notifications
Audit logging and rate limits