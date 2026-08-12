function toRoman(month) {
  const romans = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  return romans[month - 1] || 'I';
}

// existingNos: array of invoice_no strings already in the database
function nextInvoiceNumber(existingNos, dateStr, template) {
  const year = new Date(dateStr).getFullYear();
  const month = new Date(dateStr).getMonth() + 1;
  const roman = toRoman(month);

  let maxSeq = 0;
  existingNos.forEach(no => {
    if (no.endsWith('/' + year)) {
      const m = no.match(/^(\d+)\//);
      if (m) { const n = parseInt(m[1], 10); if (n > maxSeq) maxSeq = n; }
    }
  });
  const seq = String(maxSeq + 1).padStart(3, '0');

  return template
    .replace('{seq}', seq)
    .replace('{roman}', roman)
    .replace('{year}', year);
}

function numFmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = { toRoman, nextInvoiceNumber, numFmt };
