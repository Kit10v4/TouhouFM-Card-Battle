require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '30062005',
  };

  const dbName = process.env.DB_NAME || 'cardgame';

  try {
    // Connect without database first
    const connection = await mysql.createConnection(config);
    
    // Create database if not exists
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`✓ Database '${dbName}' ready`);
    
    await connection.end();

    // Connect to the database
    const dbConnection = await mysql.createConnection({
      ...config,
      database: dbName
    });

    // Read and execute migration SQL
    const sqlPath = path.join(__dirname, 'migrate.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        await dbConnection.execute(statement);
      }
    }

    console.log('✓ Migration completed successfully');
    await dbConnection.end();
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
