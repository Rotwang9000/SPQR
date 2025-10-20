# Deploying SPQR to GitHub Pages

## Prerequisites

1. GitHub repository with the SPQR code
2. Custom domain `spqr.codes` configured in your DNS provider

## Deployment Steps

### 1. Configure GitHub Repository

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Pages**
3. Under **Source**, select:
   - **Branch**: `main` (or your default branch)
   - **Folder**: `/web`
4. Click **Save**

### 2. Configure Custom Domain

1. In the **Pages** settings, under **Custom domain**, enter: `spqr.codes`
2. Click **Save**
3. Wait for DNS check to complete
4. Enable **Enforce HTTPS** once DNS is verified

### 3. Configure DNS Records

In your DNS provider (for `spqr.codes`), add these records:

#### Option A: Using CNAME (recommended)
```
Type: CNAME
Name: @
Value: <your-github-username>.github.io
```

#### Option B: Using A records
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

And add for www subdomain:
```
Type: CNAME
Name: www
Value: <your-github-username>.github.io
```

### 4. Verify Deployment

1. Wait 5-10 minutes for DNS propagation
2. Visit `https://spqr.codes`
3. The SPQR Generator should load

### 5. Deploy Updates

Any push to the `/web` folder in the main branch will automatically redeploy:

```bash
git add web/
git commit -m "Update SPQR generator"
git push origin main
```

Changes will be live within 1-2 minutes.

## Files Required for GitHub Pages

The following files are configured for GitHub Pages:

- `/web/CNAME` - Contains the custom domain name
- `/web/.nojekyll` - Tells GitHub Pages not to process with Jekyll
- `/web/index.html` - Main entry point
- `/web/app.js` - Application logic
- `/web/style.css` - Styles
- `/web/test-variants.js` - Test suite

## Troubleshooting

### Domain not resolving
- Check DNS records are correct
- Wait up to 24 hours for full DNS propagation
- Use `dig spqr.codes` to verify DNS records

### HTTPS certificate errors
- Ensure "Enforce HTTPS" is enabled in Pages settings
- Wait for GitHub to provision the certificate (can take up to 1 hour)

### 404 errors
- Verify the `/web` folder is selected in Pages settings
- Check that all files are committed to the repository
- Ensure `.nojekyll` file exists in the `/web` folder

### Updates not appearing
- Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
- Clear browser cache
- Check GitHub Actions tab for deployment status

## Testing Before Deployment

Run the comprehensive test suite locally:

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open the browser console and run:
   ```javascript
   runAllTests()
   ```

3. Ensure all tests pass before deploying

## Capacity Limits

The generator includes automatic capacity limits:
- **BWRG (4-color)**: Up to QR Version 30 (~3600 bytes total)
- **CMYRGB (8-color)**: Up to QR Version 25 (~2800 bytes total)
- **Hybrid mode**: Reduced capacity due to EC 'M' on base layer
- **Parity mode**: 2 data layers + 1 parity layer

These limits ensure reliable decoding across all QR variants.

## Features

✅ Standard QR code generation  
✅ BWRG (4-color) SPQR - 2 layers, 1.4× bigger modules  
✅ CMYRGB (8-color) SPQR - 3 layers, 1.5× bigger modules  
✅ Error Correction modes: Standard, Hybrid, Parity  
✅ Custom color palettes with accessibility presets  
✅ Adaptive color decoder for any palette  
✅ Upload QR images for decoding  
✅ Camera scanning support  
✅ Download as SVG or PNG  
✅ Comprehensive automated testing  

## Support

For issues or questions, please open an issue on the GitHub repository.

