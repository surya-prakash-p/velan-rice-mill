import sys
sys.path.insert(0, '/home/surya/frappe-bench/apps/frappe')
import frappe

def run():
    frappe.init(site='site1.local', sites_path='/home/surya/frappe-bench/sites')
    frappe.connect()
    
    user = "Administrator"
    api_key = frappe.db.get_value("User", user, "api_key")
    print(f"User: {user} | Stored API Key in DB: {api_key}")

if __name__ == '__main__':
    run()
