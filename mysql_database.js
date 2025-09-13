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
            
            // Create contacts table
            const createContactsTableQuery = `
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
            
            await conn.execute(createContactsTableQuery);
            console.log('✅ Contacts table created/verified');
            
            // Create templates table
            const createTemplatesTableQuery = `
                CREATE TABLE IF NOT EXISTS templates (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    template_name VARCHAR(100) UNIQUE NOT NULL,
                    template_data JSON NOT NULL,
                    is_active TINYINT(1) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `;
            
            await conn.execute(createTemplatesTableQuery);
            console.log('✅ Templates table created/verified');
            
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

    // Template management methods
    async saveTemplate(templateName, templateData) {
        let connection = null;
        try {
            connection = await this.pool.getConnection();
            
            const query = `
                INSERT INTO templates (
                    template_name, is_active,
                    fire_message_ar, fire_message_en,
                    choose_lang_ar, choose_lang_en,
                    yes_response_ar, yes_response_en,
                    no_response_ar, no_response_en,
                    ask_details_ar, ask_details_en,
                    updates_confirmed_ar, updates_confirmed_en,
                    updates_declined_ar, updates_declined_en,
                    thank_ar, thank_en,
                    invalid_ar, invalid_en,
                    invalid_lang_ar, invalid_lang_en
                ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    fire_message_ar = VALUES(fire_message_ar),
                    fire_message_en = VALUES(fire_message_en),
                    choose_lang_ar = VALUES(choose_lang_ar),
                    choose_lang_en = VALUES(choose_lang_en),
                    yes_response_ar = VALUES(yes_response_ar),
                    yes_response_en = VALUES(yes_response_en),
                    no_response_ar = VALUES(no_response_ar),
                    no_response_en = VALUES(no_response_en),
                    ask_details_ar = VALUES(ask_details_ar),
                    ask_details_en = VALUES(ask_details_en),
                    updates_confirmed_ar = VALUES(updates_confirmed_ar),
                    updates_confirmed_en = VALUES(updates_confirmed_en),
                    updates_declined_ar = VALUES(updates_declined_ar),
                    updates_declined_en = VALUES(updates_declined_en),
                    thank_ar = VALUES(thank_ar),
                    thank_en = VALUES(thank_en),
                    invalid_ar = VALUES(invalid_ar),
                    invalid_en = VALUES(invalid_en),
                    invalid_lang_ar = VALUES(invalid_lang_ar),
                    invalid_lang_en = VALUES(invalid_lang_en),
                    updated_at = CURRENT_TIMESTAMP
            `;
            
            const values = [
                templateName,
                templateData.ar?.fireMessage || null,
                templateData.en?.fireMessage || null,
                templateData.ar?.chooseLang || null,
                templateData.en?.chooseLang || null,
                templateData.ar?.yesResponse || null,
                templateData.en?.yesResponse || null,
                templateData.ar?.noResponse || null,
                templateData.en?.noResponse || null,
                templateData.ar?.askDetails || null,
                templateData.en?.askDetails || null,
                templateData.ar?.updatesConfirmed || null,
                templateData.en?.updatesConfirmed || null,
                templateData.ar?.updatesDeclined || null,
                templateData.en?.updatesDeclined || null,
                templateData.ar?.thank || null,
                templateData.en?.thank || null,
                templateData.ar?.invalid || null,
                templateData.en?.invalid || null,
                templateData.ar?.invalidLang || null,
                templateData.en?.invalidLang || null
            ];
            
            const [result] = await connection.execute(query, values);
            
            if (result.affectedRows > 0) {
                return { 
                    success: true, 
                    message: `Template ${templateName} saved successfully`,
                    template: { name: templateName, data: templateData }
                };
            } else {
                return { success: false, message: 'Failed to save template' };
            }
        } catch (error) {
            console.error('Error saving template:', error);
            return { success: false, error: error.message };
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    async getTemplate(templateName) {
        let connection = null;
        try {
            connection = await this.pool.getConnection();
            const query = 'SELECT * FROM templates WHERE template_name = ?';
            const [rows] = await connection.execute(query, [templateName]);
            
            if (rows.length > 0) {
                const template = rows[0];
                
                // Convert database columns back to template data structure
                const templateData = {
                    ar: {
                        fireMessage: template.fire_message_ar,
                        chooseLang: template.choose_lang_ar,
                        yesResponse: template.yes_response_ar,
                        noResponse: template.no_response_ar,
                        askDetails: template.ask_details_ar,
                        updatesConfirmed: template.updates_confirmed_ar,
                        updatesDeclined: template.updates_declined_ar,
                        thank: template.thank_ar,
                        invalid: template.invalid_ar,
                        invalidLang: template.invalid_lang_ar
                    },
                    en: {
                        fireMessage: template.fire_message_en,
                        chooseLang: template.choose_lang_en,
                        yesResponse: template.yes_response_en,
                        noResponse: template.no_response_en,
                        askDetails: template.ask_details_en,
                        updatesConfirmed: template.updates_confirmed_en,
                        updatesDeclined: template.updates_declined_en,
                        thank: template.thank_en,
                        invalid: template.invalid_en,
                        invalidLang: template.invalid_lang_en
                    }
                };
                
                return { 
                    success: true, 
                    template: {
                        name: template.template_name,
                        data: templateData,
                        is_active: template.is_active,
                        created_at: template.created_at,
                        updated_at: template.updated_at
                    }
                };
            } else {
                return { success: false, message: `Template ${templateName} not found` };
            }
        } catch (error) {
            console.error('Error getting template:', error);
            return { success: false, error: error.message };
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    async getAllTemplates() {
        let connection = null;
        try {
            connection = await this.pool.getConnection();
            const query = 'SELECT * FROM templates ORDER BY updated_at DESC';
            const [rows] = await connection.execute(query);
            
            const templates = rows.map(template => {
                // Convert database columns back to template data structure
                const templateData = {
                    ar: {
                        fireMessage: template.fire_message_ar,
                        chooseLang: template.choose_lang_ar,
                        yesResponse: template.yes_response_ar,
                        noResponse: template.no_response_ar,
                        askDetails: template.ask_details_ar,
                        updatesConfirmed: template.updates_confirmed_ar,
                        updatesDeclined: template.updates_declined_ar,
                        thank: template.thank_ar,
                        invalid: template.invalid_ar,
                        invalidLang: template.invalid_lang_ar
                    },
                    en: {
                        fireMessage: template.fire_message_en,
                        chooseLang: template.choose_lang_en,
                        yesResponse: template.yes_response_en,
                        noResponse: template.no_response_en,
                        askDetails: template.ask_details_en,
                        updatesConfirmed: template.updates_confirmed_en,
                        updatesDeclined: template.updates_declined_en,
                        thank: template.thank_en,
                        invalid: template.invalid_en,
                        invalidLang: template.invalid_lang_en
                    }
                };
                
                return {
                    name: template.template_name,
                    data: templateData,
                    is_active: template.is_active,
                    created_at: template.created_at,
                    updated_at: template.updated_at
                };
            });
            
            return { success: true, templates };
        } catch (error) {
            console.error('Error getting all templates:', error);
            return { success: false, error: error.message };
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    async deleteTemplate(templateName) {
        let connection = null;
        try {
            connection = await this.pool.getConnection();
            const query = 'DELETE FROM templates WHERE template_name = ?';
            const [result] = await connection.execute(query, [templateName]);
            
            if (result.affectedRows > 0) {
                return { 
                    success: true, 
                    message: `Template ${templateName} deleted successfully`,
                    deleted: true
                };
            } else {
                return { 
                    success: false, 
                    message: `Template ${templateName} not found`,
                    deleted: false
                };
            }
        } catch (error) {
            console.error('Error deleting template:', error);
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

    async setActiveTemplate(templateName) {
        let connection = null;
        try {
            connection = await this.pool.getConnection();
            
            // First, set all templates to inactive
            await connection.execute('UPDATE templates SET is_active = 0');
            
            // Then set the specified template as active
            const query = 'UPDATE templates SET is_active = 1 WHERE template_name = ?';
            const [result] = await connection.execute(query, [templateName]);
            
            if (result.affectedRows > 0) {
                return { 
                    success: true, 
                    message: `Template ${templateName} set as active`,
                    activeTemplate: templateName
                };
            } else {
                return { 
                    success: false, 
                    message: `Template ${templateName} not found`
                };
            }
        } catch (error) {
            console.error('Error setting active template:', error);
            return { 
                success: false, 
                error: error.message
            };
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    async getActiveTemplate() {
        let connection = null;
        try {
            connection = await this.pool.getConnection();
            const query = 'SELECT * FROM templates WHERE is_active = 1 LIMIT 1';
            const [rows] = await connection.execute(query);
            
            if (rows.length > 0) {
                const template = rows[0];
                
                // Convert database columns back to template data structure
                const templateData = {
                    ar: {
                        fireMessage: template.fire_message_ar,
                        chooseLang: template.choose_lang_ar,
                        yesResponse: template.yes_response_ar,
                        noResponse: template.no_response_ar,
                        askDetails: template.ask_details_ar,
                        updatesConfirmed: template.updates_confirmed_ar,
                        updatesDeclined: template.updates_declined_ar,
                        thank: template.thank_ar,
                        invalid: template.invalid_ar,
                        invalidLang: template.invalid_lang_ar
                    },
                    en: {
                        fireMessage: template.fire_message_en,
                        chooseLang: template.choose_lang_en,
                        yesResponse: template.yes_response_en,
                        noResponse: template.no_response_en,
                        askDetails: template.ask_details_en,
                        updatesConfirmed: template.updates_confirmed_en,
                        updatesDeclined: template.updates_declined_en,
                        thank: template.thank_en,
                        invalid: template.invalid_en,
                        invalidLang: template.invalid_lang_en
                    }
                };
                
                return { 
                    success: true, 
                    template: {
                        name: template.template_name,
                        data: templateData,
                        is_active: template.is_active,
                        created_at: template.created_at,
                        updated_at: template.updated_at
                    }
                };
            } else {
                return { 
                    success: false, 
                    message: 'No active template found'
                };
            }
        } catch (error) {
            console.error('Error getting active template:', error);
            return { 
                success: false, 
                error: error.message
            };
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
