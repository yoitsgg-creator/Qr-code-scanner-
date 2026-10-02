const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const menu = [
  {id:1,name:'Classic Cold Coffee',cat:'Drinks',price:120,emoji:'☕',desc:'Creamy chilled coffee.'},
  {id:2,name:'Badam Shake',cat:'Drinks',price:140,emoji:'🥛',desc:'Almond, milk and sweetness.'},
  {id:3,name:'Mango Mastani',cat:'Mastani',price:160,emoji:'🥭',desc:'Thick mango dessert shake.'},
  {id:4,name:'Chocolate Brownie Sundae',cat:'Ice Cream',price:180,emoji:'🍨',desc:'Brownie, chocolate and ice cream.'},
  {id:5,name:'Strawberry Scoop',cat:'Ice Cream',price:90,emoji:'🍓',desc:'Creamy strawberry ice cream.'},
  {id:6,name:'Loaded Fries',cat:'Snacks',price:150,emoji:'🍟',desc:'Crispy fries with house seasoning.'},
  {id:7,name:'Cheese Grilled Sandwich',cat:'Snacks',price:170,emoji:'🥪',desc:'Grilled sandwich with melted cheese.'},
  {id:8,name:'Fresh Fruit Juice',cat:'Juice',price:110,emoji:'🍹',desc:'Fresh seasonal fruit juice.'}
];
let memoryOrders = [];

async function initDb(){
  if(!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, table_no TEXT NOT NULL, customer_name TEXT NOT NULL,
    payment_method TEXT NOT NULL, payment_status TEXT NOT NULL DEFAULT 'pending',
    status TEXT NOT NULL DEFAULT 'New', total NUMERIC NOT NULL,
    items JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

function broadcast(message){
  const data = JSON.stringify(message);
  for(const client of wss.clients){ if(client.readyState === 1) client.send(data); }
}

async function allOrders(){
  if(pool){
    const r = await pool.query('SELECT id, table_no AS table, customer_name AS name, payment_method AS payment, payment_status, status, total, items, created_at AS "createdAt" FROM orders ORDER BY created_at DESC');
    return r.rows;
  }
  return memoryOrders;
}

app.get('/health', async (_,res)=>{
  let db='memory';
  if(pool){ try { await pool.query('SELECT 1'); db='postgres'; } catch(e){ db='postgres-error'; } }
  res.json({ok:true, realtime:true,database:db});
});
app.get('/api/menu', (_,res)=>res.json(menu));
app.get('/api/orders', async (_,res)=>{ try{res.json(await allOrders())}catch(e){res.status(500).json({error:e.message})} });

app.post('/api/orders', async (req,res)=>{
  try{
    const {table='T?',name='Guest',payment='Cash',items=[]}=req.body;
    if(!Array.isArray(items)||!items.length) return res.status(400).json({error:'Cart is empty'});
    const safeItems=items.map(i=>({id:Number(i.id),name:String(i.name),price:Number(i.price),qty:Number(i.qty)}));
    const total=safeItems.reduce((s,i)=>s+i.price*i.qty,0);
    const id='ORD-'+Date.now().toString().slice(-8);
    const order={id,table:String(table),name:String(name),payment:String(payment),payment_status:payment==='Cash'?'pending':'test_pending',status:'New',total,items:safeItems,createdAt:new Date().toISOString()};
    if(pool){
      await pool.query('INSERT INTO orders(id,table_no,customer_name,payment_method,payment_status,status,total,items) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,order.table,order.name,order.payment,order.payment_status,order.status,total,JSON.stringify(safeItems)]);
    } else memoryOrders.unshift(order);
    broadcast({type:'order.created',order});
    res.status(201).json(order);
  }catch(e){res.status(500).json({error:e.message})}
});

app.patch('/api/orders/:id/status', async (req,res)=>{
  try{
    const allowed=['New','Preparing','Ready','Completed','Cancelled'];
    const status=req.body.status;
    if(!allowed.includes(status)) return res.status(400).json({error:'Invalid status'});
    let order;
    if(pool){
      const r=await pool.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING id, table_no AS table, customer_name AS name, payment_method AS payment, payment_status, status, total, items, created_at AS "createdAt"',[status,req.params.id]);
      if(!r.rowCount) return res.status(404).json({error:'Order not found'}); order=r.rows[0];
    }else{ order=memoryOrders.find(o=>o.id===req.params.id); if(!order)return res.status(404).json({error:'Order not found'}); order.status=status; }
    broadcast({type:'order.updated',order}); res.json(order);
  }catch(e){res.status(500).json({error:e.message})}
});

wss.on('connection', async ws=>{
  ws.send(JSON.stringify({type:'connected',realtime:true}));
  ws.send(JSON.stringify({type:'orders.snapshot',orders:await allOrders()}));
});

app.get('*',(_,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

initDb().then(()=>server.listen(PORT,()=>console.log(`QR Café realtime server on ${PORT}`))).catch(err=>{console.error(err);process.exit(1)});
