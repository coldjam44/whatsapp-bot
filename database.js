// Simple file-based database for phone numbers
import fs from 'fs';
import path from 'path';

const DB_FILE = 'phone_numbers.json';

class PhoneDatabase {
    constructor() {
        this.data = this.loadData();
    }

    loadData() {
        try {
            if (fs.existsSync(DB_FILE)) {
                const content = fs.readFileSync(DB_FILE, 'utf8');
                return JSON.parse(content);
            }
        } catch (error) {
            console.error('Error loading database:', error);
        }
        return { contacts: [], groups: [] };
    }

    saveData() {
        try {
            fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving database:', error);
        }
    }

    addContact(phoneNumber, name = '', source = 'manual', notes = '') {
        const contact = {
            id: Date.now(),
            phone: phoneNumber,
            name: name,
            source: source,
            notes: notes,
            addedAt: new Date().toISOString(),
            lastMessage: null,
            messageCount: 0
        };

        // Check if contact already exists
        const existing = this.data.contacts.find(c => c.phone === phoneNumber);
        if (existing) {
            return { success: false, message: 'Contact already exists' };
        }

        this.data.contacts.push(contact);
        this.saveData();
        return { success: true, contact };
    }

    addContacts(contacts) {
        const results = [];
        for (const contact of contacts) {
            const result = this.addContact(contact.phone, contact.name, contact.source, contact.notes);
            results.push(result);
        }
        return results;
    }

    getContacts(limit = 100) {
        return this.data.contacts.slice(0, limit);
    }

    getContactsBySource(source) {
        return this.data.contacts.filter(c => c.source === source);
    }

    updateLastMessage(phoneNumber, messageId, timestamp) {
        const contact = this.data.contacts.find(c => c.phone === phoneNumber);
        if (contact) {
            contact.lastMessage = { messageId, timestamp };
            contact.messageCount = (contact.messageCount || 0) + 1;
            this.saveData();
        }
    }

    createGroup(name, contacts) {
        const group = {
            id: Date.now(),
            name: name,
            contacts: contacts,
            createdAt: new Date().toISOString()
        };
        this.data.groups.push(group);
        this.saveData();
        return group;
    }

    getGroups() {
        return this.data.groups;
    }

    updateContact(phoneNumber, name = '', source = 'manual', notes = '') {
        try {
            const contactIndex = this.data.contacts.findIndex(contact => contact.phone === phoneNumber);
            if (contactIndex !== -1) {
                this.data.contacts[contactIndex].name = name;
                this.data.contacts[contactIndex].source = source;
                this.data.contacts[contactIndex].notes = notes;
                this.data.contacts[contactIndex].updatedAt = new Date().toISOString();
                this.saveData();
                return { success: true, message: `Contact ${phoneNumber} updated successfully`, contact: this.data.contacts[contactIndex] };
            } else {
                return { success: false, message: `Contact ${phoneNumber} not found` };
            }
        } catch (error) {
            console.error('Error updating contact:', error);
            return { success: false, error: error.message };
        }
    }

    deleteContact(phoneNumber) {
        try {
            const initialLength = this.data.contacts.length;
            
            // Remove contact from array
            this.data.contacts = this.data.contacts.filter(contact => contact.phone !== phoneNumber);
            
            const finalLength = this.data.contacts.length;
            
            if (finalLength < initialLength) {
                // Contact was found and removed
                this.saveData();
                return { 
                    success: true, 
                    message: `Contact ${phoneNumber} deleted successfully`,
                    deleted: true
                };
            } else {
                // Contact not found
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
}

export default PhoneDatabase;
