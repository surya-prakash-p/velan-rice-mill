// Client Script for DocType: Sales Invoice
// Name: Sales Invoice Calculations & Descriptions
// Set to trigger on: Sales Invoice Item changes

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
        // Compute quantities (Bags * Bag Weight)
        let calculated_qty = row.custom_bags * row.custom_bag_weight;
        frappe.model.set_value(cdt, cdn, 'qty', calculated_qty);
        
        let rate_val = row.rate || 0;
        
        // Format using Indian Number Formatting (e.g., 22,140 or 1,22,140)
        let qty_formatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
        let rate_formatter = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        let formatted_qty = qty_formatter.format(calculated_qty);
        let formatted_rate = rate_formatter.format(rate_val);
        
        // Format of description: "[Item Code] = [Qty] x [Rate]"
        let description = `${row.item_code} = ${formatted_qty} x ${formatted_rate}`;
        frappe.model.set_value(cdt, cdn, 'description', description);
    }
}
