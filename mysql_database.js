import mysql from 'mysql2/promise';

class MySQLDatabase {
    constructor() {
        this.connection = null;
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
            this.connection = await mysql.createConnection(this.config);
            console.log('✅ Connected to MySQL database');
            
            // Create table if not exists
            await this.createTable();
            return true;
        } catch (error) {
            console.error('❌ Error connecting to MySQL:', error.message);
            return false;
        }
    }

    async createTable() {
        try {
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
            
            await this.connection.execute(createTableQuery);
            console.log('✅ Contacts table created/verified');
        } catch (error) {
            console.error('❌ Error creating table:', error.message);
        }
    }

    async addContact(phoneNumber, name = '', source = '', notes = '') {
        try {
            const query = `
                INSERT INTO contacts (phone, name, source, notes) 
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                name = VALUES(name), 
                source = VALUES(source), 
                notes = VALUES(notes),
                updated_at = CURRENT_TIMESTAMP
            `;
            
            const [result] = await this.connection.execute(query, [phoneNumber, name, source, notes]);
            
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
        try {
            let rows;
            
            if (source) {
                const [result] = await this.connection.execute(
                    `SELECT * FROM contacts WHERE source = '${source}' ORDER BY added_at DESC LIMIT ${parseInt(limit)}`
                );
                rows = result;
            } else {
                const [result] = await this.connection.execute(
                    `SELECT * FROM contacts ORDER BY added_at DESC LIMIT ${parseInt(limit)}`
                );
                rows = result;
            }
            
            return { success: true, contacts: rows };
        } catch (error) {
            console.error('Error getting contacts:', error);
            return { success: false, error: error.message };
        }
    }

    async updateContact(phoneNumber, name = '', source = '', notes = '', lastMessage = null, incrementCount = false) {
        try {
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
            
            const [result] = await this.connection.execute(query, params);
            
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
        }
    }

    async deleteContact(phoneNumber) {
        try {
            const query = 'DELETE FROM contacts WHERE phone = ?';
            const [result] = await this.connection.execute(query, [phoneNumber]);
            
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
        }
    }

    async getGroups() {
        try {
            const query = 'SELECT DISTINCT source as name, COUNT(*) as count FROM contacts GROUP BY source';
            const [rows] = await this.connection.execute(query);
            return rows;
        } catch (error) {
            console.error('Error getting groups:', error);
            return [];
        }
    }

    async close() {
        if (this.connection) {
            await this.connection.end();
            console.log('✅ MySQL connection closed');
        }
    }
}

export default MySQLDatabase;
