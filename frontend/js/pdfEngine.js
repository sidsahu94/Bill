// frontend/js/pdfEngine.js

/**
 * Generates a Professional SaaS-grade PDF Invoice (Luxury Theme).
 * @param {Object} invoiceData - The bill object
 * @param {String} action - 'download' to save file, 'print' to open in new tab
 */
window.generateProfessionalPDF = async function(invoiceData, action = 'download') {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // 1. Fetch Business Settings
  let biz = { name: 'CORPORATE ENTITY', gstin: '', address: '' };
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (data.name) biz = data;
    }
  } catch (e) {
    console.warn('Could not load business settings for PDF');
  }

  // --- LUXURY BRANDING CONSTANTS ---
  const goldColor = [212, 175, 55];  // #D4AF37
  const slateDark = [15, 23, 42];    // #0F172A
  const slateMuted = [100, 116, 139]; // #64748B

  // 2. HEADER
  doc.setFontSize(24);
  doc.setTextColor(...slateDark);
  doc.setFont("helvetica", "bold");
  doc.text(biz.name.toUpperCase(), 14, 24);

  doc.setFontSize(9);
  doc.setTextColor(...slateMuted);
  doc.setFont("helvetica", "normal");
  let startY = 32;
  if (biz.gstin) { doc.text(`TAX ID: ${biz.gstin}`, 14, startY); startY += 5; }
  if (biz.address) {
    const splitAddress = doc.splitTextToSize(biz.address, 80);
    doc.text(splitAddress, 14, startY);
  }

  // INVOICE META (Top Right)
  doc.setFontSize(18);
  doc.setTextColor(...goldColor); // Golden accent for document type
  doc.setFont("helvetica", "bold");
  doc.text("TAX INVOICE", 196, 24, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...slateMuted);
  doc.text(`DOCUMENT ID:`, 140, 34);
  doc.text(`DATE OF ISSUE:`, 140, 40);
  doc.text(`SETTLEMENT:`, 140, 46);

  doc.setTextColor(...slateDark);
  doc.setFont("helvetica", "bold");
  doc.text(invoiceData.invoiceNumber || 'N/A', 196, 34, { align: 'right' });
  doc.text(new Date(invoiceData.date || Date.now()).toLocaleDateString('en-IN', { year:'numeric', month:'long', day:'numeric'}), 196, 40, { align: 'right' });
  doc.text((invoiceData.paymentMethod || 'Cash').toUpperCase(), 196, 46, { align: 'right' });

  // 3. CUSTOMER DETAILS
  doc.setDrawColor(226, 232, 240); 
  doc.line(14, 54, 196, 54);

  doc.setFontSize(9);
  doc.setTextColor(...slateMuted);
  doc.setFont("helvetica", "bold");
  doc.text("BILLED TO ENTITY:", 14, 62);
  
  doc.setFontSize(11);
  doc.setTextColor(...slateDark);
  const cust = invoiceData.customer || {};
  const custName = cust.name || 'Standard Walk-in';
  doc.text(custName, 14, 68);
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...slateMuted);
  let custY = 74;
  if (cust.contact) { doc.text(`Contact: ${cust.contact}`, 14, custY); custY += 5; }
  if (cust.gstin) { doc.text(`Tax ID: ${cust.gstin}`, 14, custY); custY += 5; }
  if (cust.address) {
    const splitCustAddr = doc.splitTextToSize(cust.address, 80);
    doc.text(splitCustAddr, 14, custY);
  }

  // 4. LINE ITEMS TABLE
  const items = invoiceData.items || [];
  let rawSubtotal = 0;
  let totalTax = 0;

  const tableBody = items.map((item, index) => {
    const qty = Number(item.qty || 0);
    const price = Number(item.price || 0);
    const gstPct = Number(item.gst || 0);
    
    const itemSub = qty * price;
    const itemTax = itemSub * (gstPct / 100);
    const itemTotal = itemSub + itemTax;

    rawSubtotal += itemSub;
    totalTax += itemTax;

    const cgst = (gstPct / 2).toFixed(1) + '%';
    const sgst = cgst;

    return [
      index + 1,
      item.name || item.sku || 'Asset',
      `Rs ${price.toFixed(2)}`,
      qty,
      `Rs ${itemSub.toFixed(2)}`,
      `${cgst} / ${sgst}`,
      `Rs ${itemTotal.toFixed(2)}`
    ];
  });

  doc.autoTable({
    startY: Math.max(90, custY + 8),
    head: [['#', 'Asset Description', 'Unit Price', 'Vol', 'Subtotal', 'CGST/SGST', 'Total Amount']],
    body: tableBody,
    theme: 'plain', // Removing default grids for a cleaner, high-end look
    headStyles: { fillColor: slateDark, textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      2: { halign: 'right' },
      3: { halign: 'center' },
      4: { halign: 'right' },
      5: { halign: 'center', textColor: slateMuted },
      6: { halign: 'right', fontStyle: 'bold', textColor: slateDark }
    },
    styles: { fontSize: 9, cellPadding: 5, textColor: slateDark },
    alternateRowStyles: { fillColor: [248, 250, 252] }, // Very light slate zebra striping
  });

  // 5. SUMMARY CALCULATION
  const finalY = doc.lastAutoTable.finalY + 12;
  const discount = Number(invoiceData.discount || 0);
  const grandTotal = Number(invoiceData.totalAmount || 0);

  const totalsX = 135;
  const valuesX = 196;
  
  doc.setFontSize(9);
  doc.setTextColor(...slateMuted);
  doc.text("Taxable Amount:", totalsX, finalY);
  doc.text("Tax Assessment (GST):", totalsX, finalY + 6);
  if (discount > 0) doc.text("Concession Applied:", totalsX, finalY + 12);

  doc.setTextColor(...slateDark);
  doc.text(`Rs ${rawSubtotal.toFixed(2)}`, valuesX, finalY, { align: 'right' });
  doc.text(`Rs ${totalTax.toFixed(2)}`, valuesX, finalY + 6, { align: 'right' });
  if (discount > 0) {
    doc.setTextColor(239, 68, 68); // Red for discount
    doc.text(`- Rs ${discount.toFixed(2)}`, valuesX, finalY + 12, { align: 'right' });
  }

  // Grand Total Box (Gold Border)
  const boxY = finalY + (discount > 0 ? 18 : 12);
  doc.setFillColor(255, 255, 255); 
  doc.setDrawColor(...goldColor);
  doc.setLineWidth(0.5);
  doc.roundedRect(totalsX - 5, boxY, 70, 14, 2, 2, 'FD');

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...slateDark);
  doc.text("GROSS SETTLEMENT:", totalsX, boxY + 9);
  
  doc.setTextColor(...goldColor); // Final total in gold
  doc.text(`Rs ${grandTotal.toFixed(2)}`, valuesX - 2, boxY + 9, { align: 'right' });

  // 6. FOOTER
  const pageHeight = doc.internal.pageSize.height;
  
  // Minimalist signature line
  doc.setDrawColor(...slateMuted);
  doc.line(150, pageHeight - 35, 196, pageHeight - 35);
  doc.setFontSize(9);
  doc.setTextColor(...slateDark);
  doc.setFont("helvetica", "bold");
  doc.text("Authorized Signatory", 196, pageHeight - 29, { align: 'right' });

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...slateMuted);
  doc.text("This is a computer-generated document and requires no physical signature.", 14, pageHeight - 20);
  doc.text("Subject to standard corporate terms and conditions.", 14, pageHeight - 16);

  // 7. OUTPUT
  const filename = `${invoiceData.invoiceNumber || 'Document'}.pdf`;
  
  if (action === 'print') {
    doc.autoPrint();
    const blob = doc.output('blob');
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  } else {
    doc.save(filename);
  }
};