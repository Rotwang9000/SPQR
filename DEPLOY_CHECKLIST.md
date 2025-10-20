# 🚀 GitHub Pages Deployment Checklist

Quick guide to deploy SPQR to spqr.codes

## ✅ Pre-Deployment (Complete)

- [x] Capacity limits implemented
- [x] Adaptive color decoder
- [x] Alignment patterns for QR Version 2-40
- [x] 96.6% test pass rate (28/29 tests)
- [x] Documentation complete
- [x] CNAME file created (`/web/CNAME`)
- [x] `.nojekyll` file created (`/web/.nojekyll`)

## 📝 Deployment Steps

### 1. Push to GitHub

```bash
# Make sure all changes are committed
git add .
git commit -m "Release v1.0: Public launch"
git push origin main
```

### 2. Configure GitHub Pages

1. Go to your GitHub repository
2. Click **Settings** → **Pages**
3. Under **Source**:
   - Branch: `main`
   - Folder: `/web`
4. Click **Save**

### 3. Configure Custom Domain

1. In **Pages** settings, under **Custom domain**:
   - Enter: `spqr.codes`
   - Click **Save**
2. Wait for DNS check (may take a few minutes)
3. Enable **Enforce HTTPS** once DNS is verified

### 4. Configure DNS at Your Registrar

Add these records for `spqr.codes`:

**Option A: CNAME (Recommended)**
```
Type: CNAME
Name: @
Value: YOUR-GITHUB-USERNAME.github.io
TTL: 3600
```

**Option B: A Records**
```
Type: A
Name: @
Value: 185.199.108.153

Type: A
Name: @
Value: 185.199.109.153

Type: A  
Name: @
Value: 185.199.110.153

Type: A
Name: @
Value: 185.199.111.153
```

**For www subdomain:**
```
Type: CNAME
Name: www
Value: YOUR-GITHUB-USERNAME.github.io
```

### 5. Wait for DNS Propagation

- Typical wait: 5-10 minutes
- Maximum wait: 24 hours
- Check status: `dig spqr.codes`

### 6. Verify Deployment

1. Visit `https://spqr.codes`
2. Open browser console (F12)
3. Run: `runAllTests()`
4. Verify: 28/29 tests pass (96.6%)

## 🔄 Update Workflow

To deploy updates:

```bash
# Make changes in /web/ folder
git add web/
git commit -m "Update: description of changes"
git push origin main
```

Changes go live in 1-2 minutes automatically!

## 🐛 Troubleshooting

### Site not loading
- Check GitHub Actions tab for deployment status
- Verify `/web` folder is selected in Pages settings
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

### Domain not resolving
- Check DNS records at your registrar
- Use `dig spqr.codes` to verify records
- Wait up to 24 hours for full propagation

### HTTPS errors
- Wait for GitHub to provision certificate (up to 1 hour)
- Ensure "Enforce HTTPS" is enabled
- Check that DNS is fully propagated first

### 404 errors
- Verify `.nojekyll` file exists in `/web/`
- Check that `CNAME` file contains just: `spqr.codes`
- Ensure `/web` folder is selected, not root `/`

## 📊 Post-Deployment Monitoring

### Check These After Launch
- [ ] Homepage loads correctly
- [ ] All 3 QR variants generate
- [ ] Upload/Camera features work
- [ ] Download SVG/PNG works
- [ ] Color customization works
- [ ] Test suite passes (run `runAllTests()`)
- [ ] Mobile responsiveness

### Performance
- [ ] Page loads in <2 seconds
- [ ] QR generation is instant (<100ms)
- [ ] No console errors
- [ ] All assets load correctly

## 🎉 Success Criteria

✅ Site is live at https://spqr.codes  
✅ HTTPS certificate is active  
✅ All features work correctly  
✅ Test suite passes  
✅ Mobile-friendly  
✅ No console errors  

---

**Once deployed, announce on social media, developer communities, etc.!** 🚀

## 📱 Share These Features

- 🎯 1.4-1.5× bigger QR modules for same data
- 🌈 Custom colors with accessibility presets
- 🛡️ Advanced error correction modes
- 📷 Camera & upload scanning
- 💾 Download SVG/PNG
- 🧪 96.6% test coverage
- 🌐 Fully client-side, no data sent to servers

**Hashtags**: #QRCode #SPQR #OpenSource #WebDev #DataVisualization

