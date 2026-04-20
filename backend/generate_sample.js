const xlsx = require('xlsx');

const data = [
  { Question: '1+1 equal to?', OptA: '1', OptB: '2', OptC: '3', OptD: '4', Answer: 'B' },
  { Question: 'What color is the sky?', OptA: 'Red', OptB: 'Green', OptC: 'Blue', OptD: 'Yellow', Answer: 'C' },
  { Question: 'Capital of France?', OptA: 'Berlin', OptB: 'Paris', OptC: 'Rome', OptD: 'Madrid', Answer: 'B' },
  { Question: 'Water boiling point?', OptA: '50', OptB: '90', OptC: '100', OptD: '120', Answer: 'C' }
];

const ws = xlsx.utils.json_to_sheet(data);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
xlsx.writeFile(wb, "Sample_Questions.xlsx");

console.log("Sample_Questions.xlsx created successfully.");
