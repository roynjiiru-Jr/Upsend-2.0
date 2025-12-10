import { Hono } from 'hono';
import { Resend } from 'resend';
import type { Bindings, MagicLinkRequest, VerifyMagicLinkRequest } from '../types';
import { generateToken, createSession } from '../utils/auth';

const auth = new Hono<{ Bindings: Bindings }>();

// Request magic link
auth.post('/magic-link', async (c) => {
  try {
    const { email, name }: MagicLinkRequest = await c.req.json();
    
    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    const db = c.env.DB;
    const magicToken = generateToken(32);
    const expiresAt = Math.floor(Date.now() / 1000) + (15 * 60); // 15 minutes

    // Check if user exists
    const existingUser = await db.prepare(`
      SELECT id FROM users WHERE email = ?
    `).bind(email).first();

    if (existingUser) {
      // Update existing user with magic token
      await db.prepare(`
        UPDATE users 
        SET magic_token = ?, magic_token_expires_at = ?
        WHERE email = ?
      `).bind(magicToken, expiresAt, email).run();
    } else {
      // Create new user
      if (!name) {
        return c.json({ error: 'Name is required for new users' }, 400);
      }
      
      await db.prepare(`
        INSERT INTO users (email, name, magic_token, magic_token_expires_at)
        VALUES (?, ?, ?, ?)
      `).bind(email, name, magicToken, expiresAt).run();
    }

    // Send magic link via email using Resend
    const magicLink = `${new URL(c.req.url).origin}/auth/verify?token=${magicToken}`;
    
    try {
      const resend = new Resend(c.env.RESEND_API_KEY);
      
      const emailHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Upsend Magic Link</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 0;">
                <tr>
                    <td align="center">
                        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                            <!-- Header with gradient -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); padding: 40px; text-align: center;">
                                    <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold;">🎉 Upsend</h1>
                                </td>
                            </tr>
                            
                            <!-- Content -->
                            <tr>
                                <td style="padding: 40px;">
                                    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">Welcome back!</h2>
                                    <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                                        Click the button below to securely log in to your Upsend account. This link will expire in 15 minutes for your security.
                                    </p>
                                    
                                    <!-- CTA Button -->
                                    <table width="100%" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td align="center" style="padding: 20px 0;">
                                                <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(147, 51, 234, 0.3);">
                                                    Login to Upsend →
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                                        Or copy and paste this link into your browser:
                                    </p>
                                    <p style="margin: 8px 0 0 0; color: #9333ea; font-size: 14px; word-break: break-all;">
                                        ${magicLink}
                                    </p>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                                    <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
                                        This is an automated message from Upsend.
                                    </p>
                                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                                        If you didn't request this email, you can safely ignore it.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
      `;

      const result = await resend.emails.send({
        from: 'Upsend <onboarding@resend.dev>',
        to: email,
        subject: '🎉 Your Magic Link to Upsend',
        html: emailHtml,
      });

      console.log(`Magic link email sent to ${email}`, result);
      
      // Check if email sending failed
      if (result.error) {
        console.error('Resend API error:', result.error);
        return c.json({ 
          error: 'Failed to send magic link email',
          details: result.error.message || 'Email delivery failed'
        }, 500);
      }
      
      return c.json({ 
        success: true, 
        message: 'Magic link sent to your email! Check your inbox.',
      });
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      return c.json({ 
        error: 'Failed to send magic link email. Please try again.',
        details: emailError instanceof Error ? emailError.message : 'Unknown error'
      }, 500);
    }
  } catch (error) {
    console.error('Magic link error:', error);
    return c.json({ error: 'Failed to send magic link' }, 500);
  }
});

// Verify magic link and create session
auth.post('/verify', async (c) => {
  try {
    const { token }: VerifyMagicLinkRequest = await c.req.json();
    
    if (!token) {
      return c.json({ error: 'Token is required' }, 400);
    }

    const db = c.env.DB;
    const now = Math.floor(Date.now() / 1000);

    // Find user with valid magic token
    const user = await db.prepare(`
      SELECT id, email, name
      FROM users 
      WHERE magic_token = ? AND magic_token_expires_at > ?
    `).bind(token, now).first();

    if (!user) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    // Clear magic token
    await db.prepare(`
      UPDATE users 
      SET magic_token = NULL, magic_token_expires_at = NULL
      WHERE id = ?
    `).bind(user.id).run();

    // Create session
    const sessionToken = await createSession(db, user.id as number);

    return c.json({ 
      success: true,
      session_token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Verify error:', error);
    return c.json({ error: 'Failed to verify token' }, 500);
  }
});

// Get current user info
auth.get('/me', async (c) => {
  try {
    const sessionToken = c.req.header('Authorization')?.replace('Bearer ', '') || 
                         c.req.cookie('session_token');
    
    if (!sessionToken) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const db = c.env.DB;
    const now = Math.floor(Date.now() / 1000);

    const user = await db.prepare(`
      SELECT u.id, u.email, u.name
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.session_token = ? AND s.expires_at > ?
    `).bind(sessionToken, now).first();

    if (!user) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    return c.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    return c.json({ error: 'Failed to get user info' }, 500);
  }
});

// Logout
auth.post('/logout', async (c) => {
  try {
    const sessionToken = c.req.header('Authorization')?.replace('Bearer ', '') || 
                         c.req.cookie('session_token');
    
    if (sessionToken) {
      const db = c.env.DB;
      await db.prepare(`
        DELETE FROM sessions WHERE session_token = ?
      `).bind(sessionToken).run();
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return c.json({ error: 'Failed to logout' }, 500);
  }
});

export default auth;
