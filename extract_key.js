const fs = require('fs');
const env = fs.readFileSync('backend/.env', 'utf8');
const match = env.match(/FIREBASE_PRIVATE_KEY=\"(.*?)\"/s);
if (!match) {
    console.log("CRITICAL_ERROR: Could not find FIREBASE_PRIVATE_KEY in backend/.env");
    process.exit(1);
}
const rawKey = match[1].replace(/\\n/g, '\n');
const b64 = Buffer.from(rawKey).toString('base64');

// Split into 4 parts
const quarter = Math.ceil(b64.length / 4);
const parts = [
    b64.substring(0, quarter),
    b64.substring(quarter, quarter * 2),
    b64.substring(quarter * 2, quarter * 3),
    b64.substring(quarter * 3)
];

parts.forEach((p, idx) => {
    fs.writeFileSync(`b64_part${idx + 1}.txt`, p);
});

console.log("✅ Success! Your Base64 key has been split into 4 parts:");
console.log("   1. b64_part1.txt");
console.log("   2. b64_part2.txt");
console.log("   3. b64_part3.txt");
console.log("   4. b64_part4.txt");
