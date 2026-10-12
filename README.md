# Medicaid Filing - Financial Operations (demo prototype)

Interactive React prototype for case-level financial tracking across MFC, Policy Solutions (PS) and Simply Sold (SS).

**Demo only.** All records are fictional seed data held in the browser. It does not connect to production systems, QuickBooks, email or payments, and it uses no real patient data.

## Deploy (Vercel)
`index.html` at the repository root is the complete, self-contained app. Import the repo at vercel.com/new, set Framework Preset to **Other**, and leave Build Command and Output Directory empty.

## Rebuild from source
```
cd source
npm install esbuild react react-dom   # build deps (React is also loaded from cdnjs at runtime)
node build.mjs                        # writes source/dist.html
cp dist.html ../index.html
```
Business logic is in `source/src/calc.js`, `actions1.js` and `actions2.js`; `node source/src/test_logic.js` runs the headless rule checks.
