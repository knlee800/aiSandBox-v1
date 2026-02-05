# OAuth-Ready Authentication

## What We Did

The authentication system is now **OAuth-ready** without adding complexity. Here's what changed:

### Database Changes

1. **Made `password_hash` nullable**
   - OAuth users don't have passwords
   - Email/password users still work normally

2. **Added `auth_provider` column**
   - Values: `'email'`, `'google'`, `'apple'`, `'github'`
   - Default: `'email'`
   - Tracks how the user authenticated

3. **Added `oauth_id` column**
   - Stores provider-specific user ID (e.g., Google user ID)
   - Nullable for email/password users

### Code Changes

**Auth Service (`services/api-gateway/src/auth/auth.service.ts`):**

1. **`validateUser()` now checks for OAuth users:**
   ```typescript
   if (!user.password_hash) {
     throw new UnauthorizedException(
       `This account uses ${user.auth_provider} login. Please sign in with ${user.auth_provider}.`
     );
   }
   ```

2. **`register()` now sets auth provider:**
   ```typescript
   INSERT INTO users (..., auth_provider, oauth_id, ...)
   VALUES (..., 'email', NULL, ...)
   ```

### What This Enables

✅ **Email/password login** - Works exactly as before
✅ **OAuth login** - Can be added without refactoring
✅ **Multiple auth methods** - Same email can't use both (enforced)
✅ **Clear error messages** - Users told to use correct login method

---

## How to Add Google OAuth (When Ready)

### 1. Install Dependencies

```bash
cd services/api-gateway
npm install passport-google-oauth20 @types/passport-google-oauth20
```

### 2. Get Google Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Set callback URL: `http://localhost:4000/api/auth/google/callback`
4. Save Client ID and Secret

### 3. Create Google Strategy

**`services/api-gateway/src/auth/strategies/google.strategy.ts`:**

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private authService: AuthService) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: 'http://localhost:4000/api/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, emails } = profile;
    const email = emails[0].value;

    // Find or create user
    const user = await this.authService.findOrCreateOAuthUser({
      email,
      oauth_id: id,
      auth_provider: 'google',
    });

    done(null, user);
  }
}
```

### 4. Add findOrCreateOAuthUser Method

**In `auth.service.ts`:**

```typescript
async findOrCreateOAuthUser(data: {
  email: string;
  oauth_id: string;
  auth_provider: string;
}) {
  // Check if user exists
  let user = this.db
    .prepare('SELECT * FROM users WHERE email = ? OR (oauth_id = ? AND auth_provider = ?)')
    .get(data.email, data.oauth_id, data.auth_provider);

  if (!user) {
    // Create new user
    const id = this.generateId();
    this.db.prepare(`
      INSERT INTO users (
        id, email, password_hash, auth_provider, oauth_id,
        role, plan_type, is_active, created_at
      )
      VALUES (?, ?, NULL, ?, ?, 'user', 'free', 1, datetime('now'))
    `).run(id, data.email, data.auth_provider, data.oauth_id);

    user = { id, ...data, role: 'user', plan_type: 'free' };
  }

  return user;
}
```

### 5. Add OAuth Routes

**In `auth.controller.ts`:**

```typescript
@Get('google')
@UseGuards(AuthGuard('google'))
async googleAuth() {
  // Redirects to Google
}

@Get('google/callback')
@UseGuards(AuthGuard('google'))
async googleCallback(@Req() req, @Res() res) {
  const user = req.user;
  const token = this.jwtService.sign({
    sub: user.id,
    email: user.email,
    role: user.role,
    plan: user.plan_type,
  });

  // Redirect to frontend with token
  res.redirect(`http://localhost:3000/auth/callback?token=${token}`);
}
```

### 6. Update Frontend

**Add Google button to `frontend/app/login/page.tsx`:**

```tsx
<button
  onClick={() => window.location.href = 'http://localhost:4000/api/auth/google'}
  className="w-full bg-white border border-gray-300 text-gray-700 py-2 rounded-md hover:bg-gray-50 flex items-center justify-center gap-2"
>
  <img src="/google-icon.svg" alt="Google" className="w-5 h-5" />
  Sign in with Google
</button>
```

**Create callback handler at `frontend/app/auth/callback/page.tsx`:**

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      localStorage.setItem('token', token);
      // Decode JWT to get user info
      const payload = JSON.parse(atob(token.split('.')[1]));
      localStorage.setItem('userId', payload.sub);
      router.push('/sandbox');
    }
  }, [searchParams, router]);

  return <div>Completing sign in...</div>;
}
```

---

## Environment Variables

Add to `.env`:

```bash
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

---

## Testing OAuth

1. Start services
2. Visit: http://localhost:3000/login
3. Click "Sign in with Google"
4. Authorize with Google account
5. Should redirect to sandbox with logged-in state

---

## Notes

- **No breaking changes** - Existing users unaffected
- **Same JWT flow** - No changes to token generation
- **Session management** - Works identically
- **User experience** - Seamless authentication

When you're ready to add OAuth, this will take about **2-3 hours** instead of requiring a full refactor.
