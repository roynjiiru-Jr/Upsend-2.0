# Upsend Deployment Guide

## 🚀 Quick Deployment to Cloudflare Pages

### Prerequisites
1. Cloudflare account (free tier works)
2. Cloudflare API token with Pages and D1 permissions
3. Wrangler CLI installed (comes with project)

### Step-by-Step Deployment

#### 1. Set Up Cloudflare Authentication

**Option A: Using Wrangler Login (Interactive)**
```bash
npx wrangler login
```

**Option B: Using API Token (Non-Interactive)**
```bash
# Set environment variable
export CLOUDFLARE_API_TOKEN="your_token_here"

# Or create .env file
echo "CLOUDFLARE_API_TOKEN=your_token_here" > .env
```

#### 2. Create Production D1 Database

```bash
# Create the database
npx wrangler d1 create upsend-production

# Output will look like:
# ✅ Successfully created DB 'upsend-production'!
# 
# [[d1_databases]]
# binding = "DB"
# database_name = "upsend-production"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# IMPORTANT: Copy the database_id
```

#### 3. Update wrangler.jsonc

Replace the `database_id` in `wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "upsend",
  "compatibility_date": "2025-12-02",
  "pages_build_output_dir": "./dist",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "upsend-production",
      "database_id": "YOUR_ACTUAL_DATABASE_ID_HERE"  // ← Update this
    }
  ]
}
```

#### 4. Apply Migrations to Production Database

```bash
npx wrangler d1 migrations apply upsend-production
```

You should see:
```
Migrations to be applied:
┌─────────────────────────┐
│ name                    │
├─────────────────────────┤
│ 0001_initial_schema.sql │
└─────────────────────────┘
✅ Successfully applied 1 migration(s)
```

#### 5. Build the Project

```bash
npm run build
```

Output should show:
```
✓ built in XXXms
dist/_worker.js  XX.XX kB
```

#### 6. Create Cloudflare Pages Project

```bash
npx wrangler pages project create upsend --production-branch main
```

#### 7. Deploy to Cloudflare Pages

```bash
npx wrangler pages deploy dist --project-name upsend
```

After deployment completes, you'll see:
```
✨ Deployment complete! Take a peek over at https://xxxxxxxx.upsend.pages.dev
```

#### 8. Verify Deployment

```bash
# Test the production API
curl https://your-deployment-url.pages.dev/api/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User"}'
```

### 🔄 Subsequent Deployments

After the initial setup, deploying updates is simple:

```bash
# Build and deploy in one command
npm run deploy

# Or manually:
npm run build
npx wrangler pages deploy dist --project-name upsend
```

## 🔧 Environment Variables (Optional)

If you need to add environment secrets (like email API keys):

```bash
# Add secret
npx wrangler pages secret put EMAIL_API_KEY --project-name upsend
# You'll be prompted to enter the value

# List secrets
npx wrangler pages secret list --project-name upsend

# Delete secret
npx wrangler pages secret delete EMAIL_API_KEY --project-name upsend
```

## 🌐 Custom Domain (Optional)

### Add Custom Domain

1. Go to Cloudflare Dashboard
2. Navigate to Workers & Pages
3. Select your `upsend` project
4. Go to "Custom domains"
5. Click "Set up a domain"
6. Enter your domain (e.g., `upsend.yourdomain.com`)
7. Follow DNS setup instructions

Or via CLI:
```bash
npx wrangler pages domain add upsend.yourdomain.com --project-name upsend
```

## 📊 Database Management in Production

### Execute SQL Queries

```bash
# Run single query
npx wrangler d1 execute upsend-production \
  --command="SELECT COUNT(*) FROM users"

# Run SQL file
npx wrangler d1 execute upsend-production \
  --file=./query.sql
```

### Backup Production Database

```bash
# Export to JSON
npx wrangler d1 export upsend-production --output=backup.json

# Export to SQL
npx wrangler d1 export upsend-production --output=backup.sql --format=sql
```

### View Database Stats

```bash
npx wrangler d1 info upsend-production
```

## 🔍 Monitoring & Logs

### View Real-time Logs

```bash
npx wrangler pages deployment tail --project-name upsend
```

### View Deployment History

```bash
npx wrangler pages deployment list --project-name upsend
```

## 🚨 Troubleshooting

### Issue: "Database not found"
**Solution**: Make sure you've:
1. Created the D1 database in production
2. Updated `wrangler.jsonc` with correct `database_id`
3. Applied migrations to production database

### Issue: "Authentication failed"
**Solution**: 
```bash
# Re-login
npx wrangler logout
npx wrangler login

# Or check API token permissions
npx wrangler whoami
```

### Issue: "Build failed"
**Solution**:
```bash
# Clear cache and rebuild
rm -rf dist node_modules
npm install
npm run build
```

### Issue: "Migration already applied"
**Solution**: Migrations are tracked. If you need to reset:
```bash
# Create new migration file instead of modifying existing ones
# Example: migrations/0002_add_new_feature.sql
```

## 📈 Performance Optimization

### Enable Cloudflare CDN
Cloudflare Pages automatically uses CDN. No extra configuration needed!

### Add Caching Headers
Already implemented in the API responses. For static assets, Cloudflare handles it automatically.

### Database Optimization
- Indexes are already created in migration
- Consider adding more indexes if queries are slow:
```sql
CREATE INDEX idx_name ON table_name(column_name);
```

## 🔒 Security Checklist

Before going to production:

- [ ] Remove `dev_token` from magic-link API response
- [ ] Implement real email sending for magic links
- [ ] Add rate limiting to API endpoints
- [ ] Enable CORS only for your domain
- [ ] Add input validation and sanitization
- [ ] Set up error logging (Sentry, etc.)
- [ ] Add monitoring (Cloudflare Analytics)
- [ ] Review and harden session management
- [ ] Add Content Security Policy headers
- [ ] Implement CSRF protection for sensitive endpoints

## 📧 Email Integration (Future)

To replace dev magic links with real emails:

1. **Choose Email Service** (Resend, SendGrid, Mailgun)

2. **Add API Key as Secret**
```bash
npx wrangler pages secret put EMAIL_API_KEY --project-name upsend
```

3. **Update auth.ts**
```typescript
// Instead of returning dev_token, send email:
await sendEmail({
  to: email,
  subject: 'Sign in to Upsend',
  html: `Click here to sign in: https://yourdomain.com/auth/verify?token=${magicToken}`
});
```

## 🎯 Post-Deployment

After successful deployment:

1. **Test All Features**
   - Sign up/sign in flow
   - Create event
   - Public event page
   - Message submission
   - Contribution submission
   - Creator dashboard

2. **Set Up Monitoring**
   - Enable Cloudflare Analytics
   - Set up uptime monitoring
   - Configure error tracking

3. **Share Your App**
   - Update README with production URL
   - Share with beta testers
   - Collect feedback

## 💰 Cost Estimation

**Cloudflare Pages (Free Tier)**
- 500 builds per month
- Unlimited bandwidth
- Unlimited requests

**Cloudflare D1 (Free Tier)**
- 5GB storage
- 5 million reads per day
- 100,000 writes per day

**Total**: $0/month for small to medium traffic

**Cloudflare Workers Paid Plan** ($5/month)
- If you exceed free tier limits
- 10 million requests included
- $0.50 per additional million

## 📞 Support

- **Cloudflare Discord**: https://discord.gg/cloudflaredev
- **Cloudflare Docs**: https://developers.cloudflare.com/pages/
- **D1 Docs**: https://developers.cloudflare.com/d1/

---

Happy Deploying! 🚀
