# Public Health Emergencies (PHE) - Multi-Tool Analytics Dashboard

An integrated 10-instrument field monitoring and RCCE (Risk Communication & Community Engagement) analytics dashboard for tracking epidemic preparedness, school visits, transect audits, and gatekeeper orientations.

---

## 📁 Project Structure

```
├── index.html                  # Main dashboard HTML interface
├── style.css                   # Custom responsive styling and theme variables
├── app.js                      # Application logic, filters, Chart.js, & Leaflet maps
├── dashboard_data.json         # Normalized JSON data (read by dashboard)
├── data.js                     # Offline/direct-browser JS wrapper (prevents CORS issues)
├── update_dashboard.py         # Python 3 ETL script to parse Excel into JSON/JS
├── update_dashboard.sh         # Executable bash command to update dashboard data
├── Public_Health_Emergencies.xlsx # Local copy of raw field workbook
└── README.md                   # Documentation and workflow guide
```

---

## 🔄 How to Update Data

Whenever you add new rows or update data in the Excel workbook:

1. **Save your changes** in your Excel file.
2. In your terminal, navigate to this folder:
   ```bash
   cd "/Users/semakulaemmanuel/Library/CloudStorage/OneDrive-SharedLibraries-Solutions4People/Kenneth Mulondo - UNICEFMPOX/PHE/PHE Dashboard"
   ```
3. **Run the update command**:
   ```bash
   ./update_dashboard.sh
   ```
   *(Or alternatively: `python3 update_dashboard.py`)*

The script will automatically:
- Locate the Excel workbook.
- Parse all rows and tools (School 3-Visit sessions, Gatekeeper Dialogues, Transect Walks, PAT Preparedness Assessments, etc.).
- Update `dashboard_data.json` and `data.js`.
- Print a summary of total learners reached, unique enrolment, board games distributed, and active districts.

---

## 🚀 How to Host on GitHub Pages

### Initial Setup (First Time Only)

1. Open your terminal in this project directory:
   ```bash
   cd "/Users/semakulaemmanuel/Library/CloudStorage/OneDrive-SharedLibraries-Solutions4People/Kenneth Mulondo - UNICEFMPOX/PHE/PHE Dashboard"
   ```

2. Initialize Git and make the initial commit:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for PHE Analytics Dashboard"
   git branch -M main
   ```

3. Create a new repository on [GitHub](https://github.com/new) (e.g., `phe-rcce-dashboard`).

4. Link and push to GitHub:
   ```bash
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```

5. **Enable GitHub Pages**:
   - Go to your repository on GitHub.
   - Click **Settings** → **Pages** (in the left sidebar).
   - Under **Build and deployment** > **Branch**, select `main` and `/ (root)`.
   - Click **Save**.
   - Your dashboard will be live at: `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO_NAME/`

---

## ⚡ Routine Update Workflow (After Adding New Excel Data)

Whenever you have new field data, simply run these 3 commands:

```bash
./update_dashboard.sh
git add .
git commit -m "Update PHE field data"
git push
```

GitHub Pages will automatically rebuild and deploy your updated live dashboard within 1–2 minutes!

---

## 💻 Local Testing

You can view the dashboard locally in two ways:

1. **Directly open `index.html`**:
   Double-click `index.html` in Finder. It loads `data.js` automatically without needing any web server or CORS configurations.

2. **Run a lightweight local web server**:
   ```bash
   python3 -m http.server 8000
   ```
   Open `http://localhost:8000` in your web browser.
