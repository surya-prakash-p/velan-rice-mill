import frappe

def run():
    print("Starting P.K. Palayam Rice Mill ERPNext Backend Setup...")

    # 1. Ensure Company Exists
    company_name = "P.K. Palayam Rice Mill"
    if not frappe.db.exists("Company", company_name):
        company = frappe.new_doc("Company")
        company.company_name = company_name
        company.country = "India"
        company.default_currency = "INR"
        company.insert(ignore_permissions=True)
        frappe.db.commit()
        print(f"SUCCESS: Created Company '{company_name}'")
    else:
        print(f"INFO: Company '{company_name}' already exists.")

    # Ensure Velan Cash and Warehouse defaults exist and are set
    abbr = "PPRM"
    cash_acc = f"Velan Cash - {abbr}"
    if not frappe.db.exists("Account", cash_acc):
        doc = frappe.new_doc("Account")
        doc.account_name = "Velan Cash"
        doc.parent_account = f"Cash In Hand - {abbr}"
        doc.company = company_name
        doc.account_type = "Cash"
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        print(f"SUCCESS: Created Cash Account: {cash_acc}")
    else:
        print(f"INFO: Cash Account {cash_acc} already exists.")

    warehouse_name = f"Velan Warehouse - {abbr}"
    if not frappe.db.exists("Warehouse", warehouse_name):
        doc = frappe.new_doc("Warehouse")
        doc.warehouse_name = "Velan Warehouse"
        doc.parent_warehouse = f"All Warehouses - {abbr}"
        doc.company = company_name
        doc.is_group = 0
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        print(f"SUCCESS: Created Warehouse: {warehouse_name}")
    else:
        print(f"INFO: Warehouse {warehouse_name} already exists.")

    comp_doc = frappe.get_doc("Company", company_name)
    comp_doc.default_cash_account = cash_acc
    comp_doc.default_bank_account = cash_acc
    comp_doc.default_warehouse = warehouse_name
    comp_doc.save(ignore_permissions=True)
    frappe.db.commit()
    print("SUCCESS: Updated Company defaults to Velan settings.")

    # Helper function to create custom fields
    def create_custom_field(dt, fieldname, label, fieldtype, insert_after, options=None):
        custom_field_name = f"{dt}-{fieldname}"
        if not frappe.db.exists("Custom Field", custom_field_name):
            custom_field = frappe.new_doc("Custom Field")
            custom_field.dt = dt
            custom_field.fieldname = fieldname
            custom_field.label = label
            custom_field.fieldtype = fieldtype
            custom_field.insert_after = insert_after
            if options:
                custom_field.options = options
            custom_field.insert(ignore_permissions=True)
            frappe.db.commit()
            print(f"SUCCESS: Created custom field '{fieldname}' in '{dt}'")
        else:
            custom_field = frappe.get_doc("Custom Field", custom_field_name)
            updated = False
            if custom_field.fieldtype != fieldtype:
                custom_field.fieldtype = fieldtype
                updated = True
            if custom_field.options != options:
                custom_field.options = options
                updated = True
            if updated:
                custom_field.save(ignore_permissions=True)
                frappe.db.commit()
                print(f"SUCCESS: Updated custom field '{fieldname}' in '{dt}' to {fieldtype}")
            else:
                print(f"INFO: Custom field '{fieldname}' already exists in '{dt}' with matching config")

    # 2. Create Custom Fields
    # Sales Invoice Item Custom Fields
    create_custom_field(
        dt="Sales Invoice Item",
        fieldname="custom_bags",
        label="Bags",
        fieldtype="Int",
        insert_after="item_code"
    )
    create_custom_field(
        dt="Sales Invoice Item",
        fieldname="custom_bag_weight",
        label="Bag Weight (Kg)",
        fieldtype="Float",
        insert_after="custom_bags"
    )

    # Payment Entry Custom Fields
    create_custom_field(
        dt="Payment Entry",
        fieldname="custom_category",
        label="Custom Category",
        fieldtype="Data",
        insert_after="reference_no"
    )

    # 3. Create/Update Client Script
    script_doctype = "Client Script" if frappe.db.exists("DocType", "Client Script") else "Custom Script"
    script_name = "Sales Invoice Calculations & Descriptions"
    
    script_code = """
frappe.ui.form.on('Sales Invoice Item', {
    custom_bags: function(frm, cdt, cdn) {
        calculate_qty_and_description(frm, cdt, cdn);
    },
    custom_bag_weight: function(frm, cdt, cdn) {
        calculate_qty_and_description(frm, cdt, cdn);
    },
    rate: function(frm, cdt, cdn) {
        calculate_qty_and_description(frm, cdt, cdn);
    }
});

function calculate_qty_and_description(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    if (row.custom_bags && row.custom_bag_weight) {
        let calculated_qty = row.custom_bags * row.custom_bag_weight;
        frappe.model.set_value(cdt, cdn, 'qty', calculated_qty);
        
        let rate_val = row.rate || 0;
        
        // Format using Indian Number Formatting (e.g., 22,140 or 1,22,140)
        let qty_formatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
        let rate_formatter = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        let formatted_qty = qty_formatter.format(calculated_qty);
        let formatted_rate = rate_formatter.format(rate_val);
        
        let description = `${row.item_code} = ${formatted_qty} x ${formatted_rate}`;
        frappe.model.set_value(cdt, cdn, 'description', description);
    }
}
"""

    filters = {"dt": "Sales Invoice", "name": script_name} if script_doctype == "Client Script" else {"dt": "Sales Invoice", "script_name": script_name}
    existing_script = frappe.db.exists(script_doctype, filters)
    
    if not existing_script:
        client_script = frappe.new_doc(script_doctype)
        client_script.dt = "Sales Invoice"
        if script_doctype == "Client Script":
            client_script.name = script_name
        else:
            client_script.script_name = script_name
        client_script.script = script_code
        client_script.enabled = 1
        client_script.insert(ignore_permissions=True)
        frappe.db.commit()
        print(f"SUCCESS: Created Client Script '{script_name}'")
    else:
        doc = frappe.get_doc(script_doctype, existing_script)
        doc.script = script_code
        doc.enabled = 1
        doc.save(ignore_permissions=True)
        frappe.db.commit()
        print(f"SUCCESS: Updated Client Script '{script_name}'")

    print("Setup completed successfully!")

if __name__ == "__main__":
    import frappe
    frappe.init(site="site1.local", sites_path="/home/surya/frappe-bench/sites")
    frappe.connect()
    run()
