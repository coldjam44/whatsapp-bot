import mysql from 'mysql2/promise';

class MySQLDatabase {
    constructor() {
        this.pool = null;
        this.config = {
            host: 'localhost',
            user: 'botdb',
            password: 'botdbbotdb',
            database: 'botdb',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        };
    }

    async connect() {
        try {
            this.pool = mysql.createPool(this.config);
            console.log('✅ Connected to MySQL database pool');
            
            // Test connection and create table
            const connection = await this.pool.getConnection();
            await this.createTable(connection);
            connection.release();
            return true;
        } catch (error) {
            console.error('❌ Error connecting to MySQL:', error.message);
            return false;
        }
    }

    async createTable(connection = null) {
        try {
            const conn = connection || await this.pool.getConnection();
            const createTableQuery = `
                CREATE TABLE IF NOT EXISTS contacts (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    phone VARCHAR(20) UNIQUE NOT NULL,
                    name VARCHAR(255) DEFAULT '',
                    source VARCHAR(100) DEFAULT '',
                    notes TEXT,
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    last_message TEXT NULL,
                    message_count INT DEFAULT 0
                )
            `;
            
            await conn.execute(createTableQuery);
            console.log('✅ Contacts table created/verified');
            
            if (!connection) {
                conn.release();
            }
        } catch (error) {
            console.error('❌ Error creating table:', error.message);
        }
    }

    async addContact(phoneNumber, name = '', source = '', notes = '') {
        let connection = null;
        try {
            // Get connection from pool
            connection = await this.pool.getConnection();
            
            const query = `
                INSERT INTO contacts (phone, name, source, notes) 
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                name = VALUES(name), 
                source = VALUES(source), 
                notes = VALUES(notes),
                updated_at = CURRENT_TIMESTAMP
            `;
            
            const [result] = await connection.execute(query, [phoneNumber, name, source, notes]);
            
            if (result.affectedRows > 0) {
                return { 
                    success: true, 
                    message: `Contact ${phoneNumber} saved successfully`,
                    contact: { id: result.insertId, phone: phoneNumber, name, source, notes }
                };
            } else {
                return { success: false, message: 'Failed to save contact' };
            }
        } catch (error) {
            console.error('Error adding contact:', error);
            return { success: false, error: error.message };
        } finally {
            // Always release the connection back to the pool
            if (connection) {
                connection.release();
            }
        }
    }

    async addContacts(contacts) {
        const results = [];
        for (const contact of contacts) {
            const result = await this.addContact(contact.phone, contact.name, contact.source, contact.notes);
            results.push(result);
        }
        return results;
    }

    async getContacts(limit = 100, source = null) {
        let connection = null;
        try {
            connection = await this.pool.getConnection();
            let rows;
            
            // Sanitize limit to prevent SQL injection
            const safeLimit = Math.max(1, Math.min(parseInt(limit) || 100, 1000));
            
            if (source) {
                // Use string interpolation for LIMIT since it doesn't work with prepared statements
                const [result] = await connection.execute(
                    `SELECT * FROM contacts WHERE source = ? ORDER BY added_at DESC LIMIT ${safeLimit}`,
                    [source]
                );
                rows = result;
            } else {
                // Use string interpolation for LIMIT since it doesn't work with prepared statements
                const [result] = await connection.execute(
                    `SELECT * FROM contacts ORDER BY added_at DESC LIMIT ${safeLimit}`
                );
                rows = result;
            }
            
            return { success: true, contacts: rows };
        } catch (error) {
            console.error('Error getting contacts:', error);
            return { success: false, error: error.message };
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    async updateContact(phoneNumber, name = '', source = '', notes = '', lastMessage = null, incrementCount = false) {
        let connection = null;
        try {
            connection = await this.pool.getConnection();
            let query, params;
            
            if (lastMessage !== null || incrementCount) {
                // Update with message info
                query = `
                    UPDATE contacts 
                    SET name = ?, source = ?, notes = ?, 
                        last_message = ?, 
                        message_count = message_count + ?,
                        updated_at = CURRENT_TIMESTAMP 
                    WHERE phone = ?
                `;
                params = [name, source, notes, lastMessage, incrementCount ? 1 : 0, phoneNumber];
            } else {
                // Regular update
                query = `
                    UPDATE contacts 
                    SET name = ?, source = ?, notes = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE phone = ?
                `;
                params = [name, source, notes, phoneNumber];
            }
            
            const [result] = await connection.execute(query, params);
            
            if (result.affectedRows > 0) {
                return { 
                    success: true, 
                    message: `Contact ${phoneNumber} updated successfully`,
                    contact: { phone: phoneNumber, name, source, notes }
                };
            } else {
                return { success: false, message: `Contact ${phoneNumber} not found` };
            }
        } catch (error) {
            console.error('Error updating contact:', error);
            return { success: false, error: error.message };
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    async deleteContact(phoneNumber) {
        let connection = null;
        try {
            connection = await this.pool.getConnection();
            const query = 'DELETE FROM contacts WHERE phone = ?';
            const [result] = await connection.execute(query, [phoneNumber]);
            
            if (result.affectedRows > 0) {
                return { 
                    success: true, 
                    message: `Contact ${phoneNumber} deleted successfully`,
                    deleted: true
                };
            } else {
                return { 
                    success: false, 
                    message: `Contact ${phoneNumber} not found`,
                    deleted: false
                };
            }
        } catch (error) {
            console.error('Error deleting contact:', error);
            return { 
                success: false, 
                error: error.message,
                deleted: false
            };
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    async getGroups() {
        let connection = null;
        try {
            connection = await this.pool.getConnection();
            const query = 'SELECT DISTINCT source as name, COUNT(*) as count FROM contacts GROUP BY source';
            const [rows] = await connection.execute(query);
            return rows;
        } catch (error) {
            console.error('Error getting groups:', error);
            return [];
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            console.log('✅ MySQL connection pool closed');
        }
    }
}

export default MySQLDatabase;
