const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const pool = require('./db'); // Import your database connection module
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
  cors: {origin:"http://localhost:3000", methods: ["GET", "POST"]},
});

const port = 4000;

app.use(express.json()); 
const corsOptions = {
    origin: 'http://localhost:3000',
    optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
  };
  
  app.use(cors(corsOptions));







// GET request to fetch data from both tables
app.get('/', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    
    const container1Data = await conn.query('SELECT * FROM container1 ORDER BY priority ASC');
    const container2Data = await conn.query('SELECT * FROM container2 ORDER BY priority ASC');
    
    conn.release();
    
    res.json({ container1: container1Data, container2: container2Data });
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).send('Error fetching data from the database');
  }
});






// POST request to insert data into the tables
app.post('/', async (req, res) => {
  const { sd, si, dd, di } = req.body;
  

  let connection = await pool.getConnection();
  try {
    
    // Start a transaction
    await connection.beginTransaction();


    
    if (sd !== dd) {

    // Fetch the row from the source table
    const rows = await connection.query(`SELECT * FROM ${connection.escapeId(sd)} WHERE priority = ?`, [si]);
    
    if (rows.length === 0) {
      throw new Error(`No row found in ${sd} table with priority ${si}`);
    }
    
    const fetchedRow = rows[0];
    
    // Delete the row from the source table
    await connection.query(`DELETE FROM ${connection.escapeId(sd)} WHERE priority = ?`, [si]);
    
    // Decrement priority for every row having priority > si in the source table
    await connection.query(`UPDATE ${connection.escapeId(sd)} SET priority = priority - 1 WHERE priority > ?`, [si]);
    
    // Increment priority for every row having priority >= di in the destination table
    await connection.query(`UPDATE ${connection.escapeId(dd)} SET priority = priority + 1 WHERE priority >= ?`, [di]);
    
    // Insert the fetched row into the destination table with priority = di
    if (fetchedRow) {
        const columns = Object.keys(fetchedRow).filter(col => col !== 'priority');
        const values = columns.map(col => fetchedRow[col]);
        values.push(di); // Add the new priority value

        const placeholders = columns.map(() => '?').join(', ');
        const columnNames = columns.map(col => connection.escapeId(col)).join(', '); // Escape column names
        
        const sql = `INSERT INTO ${connection.escapeId(dd)} (${columnNames}, priority) VALUES (${placeholders}, ?)`;
        await connection.query(sql, [...values, di]);
      } else {
        throw new Error('Failed to fetch row from source table');
      }


      
    }else{

  
      if (si < di) {

        // Case: si < di
        // Decrement priority for rows where priority > si and priority <= di
        const [row] = await connection.query(`SELECT id FROM ${connection.escapeId(sd)} WHERE priority = ?`, [si]);
        
        await connection.query(`UPDATE ${connection.escapeId(sd)} SET priority = priority - 1 WHERE priority > ? AND priority <= ?`, [si, di]);
  
        // Update priority to di for the row where priority = si
        
        if (row) {
          const id = row.id;
          await connection.query(`UPDATE ${connection.escapeId(sd)} SET priority = ? WHERE id = ?`, [di, id]);
        }
      } else if (si > di) {
        
        const [row] = await connection.query(`SELECT id FROM ${connection.escapeId(sd)} WHERE priority = ?`, [si]);
        // Case: si > di
        // Increment priority for rows where priority >= di and priority < si
        await connection.query(`UPDATE ${connection.escapeId(sd)} SET priority = priority + 1 WHERE priority >= ? AND priority < ?`, [di, si]);
  
        // Update priority to di for the row where priority = si
        if (row) {
          const id = row.id;
          await connection.query(`UPDATE ${connection.escapeId(sd)} SET priority = ? WHERE id = ?`, [di, id]);
        }
      }
    }
      // Commit the transaction
      await connection.commit();
      io.emit('updateData', { sd, si, dd, di });

      res.status(200).send('Row moved successfully');
    } catch (error) {
      if (connection) await connection.rollback(); // Rollback the transaction in case of error
      console.error(error.message);
      res.status(500).send('Error occurred');
    } finally {
      if (connection) connection.release(); // Release the connection
    }
});





io.on('connection', (socket) => {
  console.log('A user connected');

  // Example: Handle socket events
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Start the server
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});