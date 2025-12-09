import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/cloudflare-workers';
import type { Bindings } from './types';

// Import routes
import auth from './routes/auth';
import events from './routes/events';
import messages from './routes/messages';
import contributions from './routes/contributions';

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS
app.use('/api/*', cors());

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }));

// API routes
app.route('/api/auth', auth);
app.route('/api/events', events);
app.route('/api/messages', messages);
app.route('/api/contributions', contributions);

// Image upload endpoint
app.post('/api/upload-image', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('image') as File;
    
    if (!file) {
      return c.json({ error: 'No image file provided' }, 400);
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return c.json({ error: 'File must be an image' }, 400);
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: 'Image must be less than 5MB' }, 400);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const extension = file.name.split('.').pop();
    const key = `events/${timestamp}-${randomStr}.${extension}`;

    // Upload to R2
    await c.env.IMAGES.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    });

    // Return public URL (for local dev, we'll use a placeholder pattern)
    const publicUrl = `https://pub-upsend.r2.dev/${key}`;
    
    return c.json({ 
      success: true,
      url: publicUrl,
      key: key
    });
  } catch (error) {
    console.error('Upload error:', error);
    return c.json({ error: 'Failed to upload image' }, 500);
  }
});

// Frontend pages
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Upsend - Create Beautiful Event Pages</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script>
          tailwind.config = {
            theme: {
              extend: {
                colors: {
                  primary: '#6366f1',
                  secondary: '#ec4899',
                }
              }
            }
          }
        </script>
    </head>
    <body class="bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 min-h-screen">
        <div class="container mx-auto px-4 py-16">
            <div class="max-w-4xl mx-auto text-center">
                <h1 class="text-6xl font-bold text-gray-800 mb-6">
                    <span class="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600">
                        Upsend
                    </span>
                </h1>
                <p class="text-2xl text-gray-600 mb-8">
                    Create beautiful event pages to collect messages and contributions
                </p>
                <div class="space-x-4">
                    <a href="/auth" class="inline-block px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200">
                        Get Started
                    </a>
                    <a href="/auth" class="inline-block px-8 py-4 bg-white text-gray-700 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">
                        Sign In
                    </a>
                </div>
            </div>

            <div class="grid md:grid-cols-3 gap-8 mt-20 max-w-5xl mx-auto">
                <div class="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl transition-shadow">
                    <div class="text-4xl mb-4 text-purple-600">
                        <i class="fas fa-calendar-plus"></i>
                    </div>
                    <h3 class="text-xl font-bold text-gray-800 mb-3">Create Events</h3>
                    <p class="text-gray-600">Set up beautiful event pages in seconds with customizable details</p>
                </div>

                <div class="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl transition-shadow">
                    <div class="text-4xl mb-4 text-pink-600">
                        <i class="fas fa-share-alt"></i>
                    </div>
                    <h3 class="text-xl font-bold text-gray-800 mb-3">Share & Collect</h3>
                    <p class="text-gray-600">Get a unique shareable link to collect messages and contributions</p>
                </div>

                <div class="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl transition-shadow">
                    <div class="text-4xl mb-4 text-blue-600">
                        <i class="fas fa-chart-line"></i>
                    </div>
                    <h3 class="text-xl font-bold text-gray-800 mb-3">Track Everything</h3>
                    <p class="text-gray-600">View all messages publicly and track contributions privately</p>
                </div>
            </div>
        </div>
    </body>
    </html>
  `);
});

// Auth page
app.get('/auth', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Sign In - Upsend</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    </head>
    <body class="bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 min-h-screen">
        <div class="container mx-auto px-4 py-16">
            <div class="max-w-md mx-auto bg-white rounded-2xl shadow-xl p-8">
                <h2 class="text-3xl font-bold text-center mb-2 text-gray-800">Welcome to Upsend</h2>
                <p class="text-center text-gray-600 mb-8">Sign in with your email</p>
                
                <div id="auth-form">
                    <div class="mb-4">
                        <label class="block text-gray-700 font-medium mb-2">Email</label>
                        <input type="email" id="email" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent" placeholder="you@example.com" required>
                    </div>
                    
                    <div class="mb-6" id="name-field" style="display:none;">
                        <label class="block text-gray-700 font-medium mb-2">Name</label>
                        <input type="text" id="name" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent" placeholder="Your name">
                    </div>
                    
                    <button onclick="requestMagicLink()" class="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 rounded-lg hover:shadow-lg transition-all duration-200">
                        Continue with Email
                    </button>
                </div>

                <div id="magic-link-sent" style="display:none;" class="text-center">
                    <div class="text-6xl text-green-500 mb-4">✓</div>
                    <h3 class="text-xl font-bold text-gray-800 mb-2">Check your email!</h3>
                    <p class="text-gray-600 mb-4">We've sent you a magic link to sign in.</p>
                    <p class="text-sm text-gray-500">For MVP testing, click the link below:</p>
                    <a id="dev-link" href="#" class="inline-block mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                        Verify Magic Link
                    </a>
                </div>

                <div id="error-message" class="mt-4 p-3 bg-red-100 text-red-700 rounded-lg" style="display:none;"></div>
            </div>
        </div>

        <script>
            async function requestMagicLink() {
                const email = document.getElementById('email').value;
                const name = document.getElementById('name').value;
                const errorDiv = document.getElementById('error-message');
                
                if (!email) {
                    errorDiv.textContent = 'Please enter your email';
                    errorDiv.style.display = 'block';
                    return;
                }

                try {
                    const response = await axios.post('/api/auth/magic-link', { email, name: name || undefined });
                    
                    if (response.data.success) {
                        document.getElementById('auth-form').style.display = 'none';
                        document.getElementById('magic-link-sent').style.display = 'block';
                        
                        // For MVP testing
                        if (response.data.dev_link) {
                            document.getElementById('dev-link').href = response.data.dev_link;
                            document.getElementById('dev-link').onclick = (e) => {
                                e.preventDefault();
                                verifyToken(response.data.dev_token);
                            };
                        }
                    }
                } catch (error) {
                    if (error.response?.data?.error === 'Name is required for new users') {
                        document.getElementById('name-field').style.display = 'block';
                        errorDiv.textContent = 'Please enter your name to create an account';
                        errorDiv.style.display = 'block';
                    } else {
                        errorDiv.textContent = error.response?.data?.error || 'Failed to send magic link';
                        errorDiv.style.display = 'block';
                    }
                }
            }

            async function verifyToken(token) {
                try {
                    const response = await axios.post('/api/auth/verify', { token });
                    
                    if (response.data.success) {
                        localStorage.setItem('session_token', response.data.session_token);
                        localStorage.setItem('user', JSON.stringify(response.data.user));
                        window.location.href = '/dashboard';
                    }
                } catch (error) {
                    document.getElementById('error-message').textContent = 'Failed to verify token';
                    document.getElementById('error-message').style.display = 'block';
                }
            }

            // Check URL for token
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');
            if (token) {
                verifyToken(token);
            }
        </script>
    </body>
    </html>
  `);
});

// Dashboard page
app.get('/dashboard', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard - Upsend</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50 min-h-screen">
        <nav class="bg-white shadow-sm">
            <div class="container mx-auto px-4 py-4">
                <div class="flex justify-between items-center">
                    <h1 class="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600">Upsend</h1>
                    <div class="flex items-center gap-4">
                        <span id="user-name" class="text-gray-700"></span>
                        <button onclick="logout()" class="text-gray-600 hover:text-gray-800">
                            <i class="fas fa-sign-out-alt"></i> Logout
                        </button>
                    </div>
                </div>
            </div>
        </nav>

        <div class="container mx-auto px-4 py-8">
            <div class="max-w-6xl mx-auto">
                <div class="flex justify-between items-center mb-8">
                    <h2 class="text-3xl font-bold text-gray-800">My Events</h2>
                    <a href="/create-event" class="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all">
                        <i class="fas fa-plus mr-2"></i>Create Event
                    </a>
                </div>

                <div id="events-list" class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div class="text-center py-12 col-span-full">
                        <div class="text-gray-400 text-lg">Loading events...</div>
                    </div>
                </div>
            </div>
        </div>

        <script>
            axios.defaults.headers.common['Authorization'] = 'Bearer ' + localStorage.getItem('session_token');

            async function checkAuth() {
                try {
                    const response = await axios.get('/api/auth/me');
                    document.getElementById('user-name').textContent = response.data.user.name;
                    loadEvents();
                } catch (error) {
                    window.location.href = '/auth';
                }
            }

            async function loadEvents() {
                try {
                    const response = await axios.get('/api/events/creator/list');
                    const events = response.data.events;
                    
                    const eventsContainer = document.getElementById('events-list');
                    
                    if (events.length === 0) {
                        eventsContainer.innerHTML = \`
                            <div class="col-span-full text-center py-12">
                                <div class="text-gray-400 text-lg mb-4">No events yet</div>
                                <a href="/create-event" class="text-purple-600 hover:text-purple-700 font-medium">Create your first event</a>
                            </div>
                        \`;
                        return;
                    }

                    eventsContainer.innerHTML = events.map(event => \`
                        <div class="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow overflow-hidden">
                            \${event.cover_image ? \`<img src="\${event.cover_image}" class="w-full h-48 object-cover">\` : \`
                                <div class="w-full h-48 bg-gradient-to-br from-purple-400 to-pink-400"></div>
                            \`}
                            <div class="p-6">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">\${event.title}</h3>
                                <p class="text-gray-600 text-sm mb-4">
                                    <i class="far fa-calendar mr-1"></i>\${new Date(event.event_date).toLocaleDateString()}
                                </p>
                                <div class="flex justify-between text-sm text-gray-600 mb-4">
                                    <span><i class="far fa-comment mr-1"></i>\${event.message_count || 0} messages</span>
                                    <span><i class="fas fa-dollar-sign mr-1"></i>\${parseFloat(event.total_contributions || 0).toFixed(2)}</span>
                                </div>
                                <div class="flex gap-2">
                                    <a href="/event-details/\${event.id}" class="flex-1 px-4 py-2 bg-purple-600 text-white text-center rounded-lg hover:bg-purple-700 transition-colors text-sm">
                                        View Details
                                    </a>
                                    <button onclick="copyLink('\${event.shareable_link}')" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm" title="Copy link">
                                        <i class="fas fa-link"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    \`).join('');
                } catch (error) {
                    console.error('Failed to load events:', error);
                }
            }

            function copyLink(shareableLink) {
                const url = window.location.origin + '/event/' + shareableLink;
                navigator.clipboard.writeText(url);
                alert('Link copied to clipboard!');
            }

            function logout() {
                axios.post('/api/auth/logout');
                localStorage.clear();
                window.location.href = '/';
            }

            checkAuth();
        </script>
    </body>
    </html>
  `);
});

// Create event page
app.get('/create-event', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Create Event - Upsend</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50 min-h-screen">
        <nav class="bg-white shadow-sm">
            <div class="container mx-auto px-4 py-4">
                <div class="flex justify-between items-center">
                    <h1 class="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600">Upsend</h1>
                    <a href="/dashboard" class="text-gray-600 hover:text-gray-800">
                        <i class="fas fa-arrow-left mr-2"></i>Back to Dashboard
                    </a>
                </div>
            </div>
        </nav>

        <div class="container mx-auto px-4 py-8">
            <div class="max-w-2xl mx-auto">
                <h2 class="text-3xl font-bold text-gray-800 mb-8">Create New Event</h2>
                
                <form id="create-event-form" class="bg-white rounded-xl shadow-md p-8">
                    <div class="mb-6">
                        <label class="block text-gray-700 font-medium mb-2">Event Title *</label>
                        <input type="text" id="title" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent" placeholder="Birthday Party, Wedding, Fundraiser..." required>
                    </div>

                    <div class="mb-6">
                        <label class="block text-gray-700 font-medium mb-2">Description</label>
                        <textarea id="description" rows="4" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent" placeholder="Tell guests about your event..."></textarea>
                    </div>

                    <div class="mb-6">
                        <label class="block text-gray-700 font-medium mb-2">Event Date *</label>
                        <input type="date" id="event_date" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent" required>
                    </div>

                    <div class="mb-6">
                        <label class="block text-gray-700 font-medium mb-2">Cover Image (optional)</label>
                        <input type="file" id="cover_image" accept="image/*" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent">
                        <div id="image-preview" class="mt-4" style="display:none;">
                            <img id="preview-img" src="" alt="Preview" class="max-w-full h-48 object-cover rounded-lg">
                        </div>
                        <div id="upload-status" class="mt-2 text-sm text-gray-600"></div>
                    </div>

                    <button type="submit" id="submit-btn" class="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 rounded-lg hover:shadow-lg transition-all duration-200">
                        Create Event
                    </button>

                    <div id="error-message" class="mt-4 p-3 bg-red-100 text-red-700 rounded-lg" style="display:none;"></div>
                </form>
            </div>
        </div>

        <script>
            axios.defaults.headers.common['Authorization'] = 'Bearer ' + localStorage.getItem('session_token');

            let uploadedImageUrl = null;

            // Handle image preview
            document.getElementById('cover_image').addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        document.getElementById('preview-img').src = e.target.result;
                        document.getElementById('image-preview').style.display = 'block';
                    };
                    reader.readAsDataURL(file);
                }
            });

            document.getElementById('create-event-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const title = document.getElementById('title').value;
                const description = document.getElementById('description').value;
                const event_date = document.getElementById('event_date').value;
                const coverImageFile = document.getElementById('cover_image').files[0];
                const submitBtn = document.getElementById('submit-btn');
                const statusDiv = document.getElementById('upload-status');

                try {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Creating Event...';

                    // Upload image if selected
                    let cover_image_url = null;
                    if (coverImageFile) {
                        statusDiv.textContent = 'Uploading image...';
                        const formData = new FormData();
                        formData.append('image', coverImageFile);

                        const uploadResponse = await axios.post('/api/upload-image', formData, {
                            headers: {
                                'Content-Type': 'multipart/form-data'
                            }
                        });

                        if (uploadResponse.data.success) {
                            cover_image_url = uploadResponse.data.url;
                            statusDiv.textContent = 'Image uploaded!';
                        }
                    }

                    // Create event
                    statusDiv.textContent = 'Creating event...';
                    const response = await axios.post('/api/events/create', {
                        title,
                        description: description || undefined,
                        event_date,
                        cover_image: cover_image_url || undefined
                    });

                    if (response.data.success) {
                        window.location.href = '/dashboard';
                    }
                } catch (error) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Create Event';
                    statusDiv.textContent = '';
                    const errorDiv = document.getElementById('error-message');
                    errorDiv.textContent = error.response?.data?.error || 'Failed to create event';
                    errorDiv.style.display = 'block';
                }
            });

            // Check auth
            axios.get('/api/auth/me').catch(() => {
                window.location.href = '/auth';
            });
        </script>
    </body>
    </html>
  `);
});

// Public event page
app.get('/event/:shareableLink', async (c) => {
  const shareableLink = c.req.param('shareableLink');
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Event - Upsend</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 min-h-screen">
        <div class="container mx-auto px-4 py-8">
            <div class="max-w-4xl mx-auto">
                <div class="flex justify-end mb-4">
                    <a href="/" class="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all">
                        Create Your Own Event
                    </a>
                </div>
                <div id="event-content">
                    <div class="text-center py-12">
                        <div class="text-gray-400 text-lg">Loading event...</div>
                    </div>
                </div>
            </div>
        </div>

        <script>
            const shareableLink = '${shareableLink}';
            let eventId = null;

            async function loadEvent() {
                try {
                    const response = await axios.get('/api/events/' + shareableLink);
                    const { event, messages } = response.data;
                    eventId = event.id;

                    document.title = event.title + ' - Upsend';

                    document.getElementById('event-content').innerHTML = \`
                        <div class="bg-white rounded-2xl shadow-xl overflow-hidden mb-8">
                            \${event.cover_image ? \`
                                <img src="\${event.cover_image}" class="w-full h-64 object-cover">
                            \` : \`
                                <div class="w-full h-64 bg-gradient-to-br from-purple-400 to-pink-400"></div>
                            \`}
                            <div class="p-8">
                                <h1 class="text-4xl font-bold text-gray-800 mb-2">\${event.title}</h1>
                                <p class="text-gray-600 mb-4">
                                    <i class="far fa-calendar mr-2"></i>\${new Date(event.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                </p>
                                \${event.description ? \`<p class="text-gray-700 text-lg mb-6">\${event.description}</p>\` : ''}
                                <p class="text-sm text-gray-500">Created by \${event.creator_name}</p>
                            </div>
                        </div>

                        <div class="grid md:grid-cols-2 gap-8">
                            <div class="bg-white rounded-xl shadow-lg p-6">
                                <h2 class="text-2xl font-bold text-gray-800 mb-4">
                                    <i class="far fa-comment-dots mr-2 text-purple-600"></i>Leave a Message
                                </h2>
                                <form id="message-form">
                                    <div class="mb-4">
                                        <label class="block text-gray-700 font-medium mb-2">Your Name (optional)</label>
                                        <input type="text" id="user_name" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent" placeholder="Anonymous">
                                    </div>
                                    <div class="mb-4">
                                        <label class="block text-gray-700 font-medium mb-2">Message *</label>
                                        <textarea id="message_text" rows="4" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent" placeholder="Share your thoughts..." required></textarea>
                                    </div>
                                    <button type="submit" class="w-full bg-purple-600 text-white font-semibold py-3 rounded-lg hover:bg-purple-700 transition-colors">
                                        Send Message
                                    </button>
                                </form>
                                <div id="message-success" class="mt-4 p-3 bg-green-100 text-green-700 rounded-lg" style="display:none;">
                                    Message sent successfully!
                                </div>
                            </div>

                            <div class="bg-white rounded-xl shadow-lg p-6">
                                <h2 class="text-2xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-gift mr-2 text-pink-600"></i>Make a Contribution
                                </h2>
                                <form id="contribution-form">
                                    <div class="mb-4">
                                        <label class="block text-gray-700 font-medium mb-2">Your Name (optional)</label>
                                        <input type="text" id="contributor_name" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-600 focus:border-transparent" placeholder="Anonymous">
                                    </div>
                                    <div class="mb-4">
                                        <label class="block text-gray-700 font-medium mb-2">Amount *</label>
                                        <div class="relative">
                                            <span class="absolute left-4 top-3 text-gray-500">$</span>
                                            <input type="number" id="amount" step="0.01" min="0.01" class="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-600 focus:border-transparent" placeholder="0.00" required>
                                        </div>
                                    </div>
                                    <button type="submit" class="w-full bg-pink-600 text-white font-semibold py-3 rounded-lg hover:bg-pink-700 transition-colors">
                                        Contribute
                                    </button>
                                </form>
                                <div id="contribution-success" class="mt-4 p-3 bg-green-100 text-green-700 rounded-lg" style="display:none;">
                                    Thank you for your contribution!
                                </div>
                            </div>
                        </div>

                        <div class="bg-white rounded-xl shadow-lg p-6 mt-8">
                            <h2 class="text-2xl font-bold text-gray-800 mb-6">
                                <i class="fas fa-comments mr-2 text-blue-600"></i>Messages
                            </h2>
                            <div id="messages-list" class="space-y-4">
                                \${messages.length === 0 ? \`
                                    <p class="text-gray-500 text-center py-8">No messages yet. Be the first to leave one!</p>
                                \` : messages.map(msg => \`
                                    <div class="bg-gray-50 rounded-lg p-4">
                                        <p class="font-semibold text-gray-800 mb-1">\${msg.user_name || 'Anonymous'}</p>
                                        <p class="text-gray-700">\${msg.message_text}</p>
                                    </div>
                                \`).join('')}
                            </div>
                        </div>

                        <div class="mt-8 text-center">
                            <button onclick="shareEvent()" class="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:shadow-lg hover:bg-blue-700 transition-all">
                                Share This Event
                            </button>
                        </div>
                    \`;

                    // Setup form handlers
                    document.getElementById('message-form').addEventListener('submit', submitMessage);
                    document.getElementById('contribution-form').addEventListener('submit', submitContribution);
                } catch (error) {
                    document.getElementById('event-content').innerHTML = \`
                        <div class="text-center py-12">
                            <div class="text-red-600 text-lg mb-4">Event not found</div>
                            <a href="/" class="text-purple-600 hover:text-purple-700">Go to homepage</a>
                        </div>
                    \`;
                }
            }

            async function submitMessage(e) {
                e.preventDefault();
                const user_name = document.getElementById('user_name').value;
                const message_text = document.getElementById('message_text').value;

                try {
                    await axios.post('/api/messages/create', {
                        event_id: eventId,
                        user_name: user_name || undefined,
                        message_text
                    });

                    document.getElementById('message-success').style.display = 'block';
                    document.getElementById('message-form').reset();
                    
                    setTimeout(() => {
                        document.getElementById('message-success').style.display = 'none';
                        loadEvent(); // Reload to show new message
                    }, 2000);
                } catch (error) {
                    alert('Failed to send message');
                }
            }

            async function submitContribution(e) {
                e.preventDefault();
                const contributor_name = document.getElementById('contributor_name').value;
                const amount = parseFloat(document.getElementById('amount').value);

                try {
                    await axios.post('/api/contributions/create', {
                        event_id: eventId,
                        contributor_name: contributor_name || undefined,
                        amount
                    });

                    document.getElementById('contribution-success').style.display = 'block';
                    document.getElementById('contribution-form').reset();
                    
                    setTimeout(() => {
                        document.getElementById('contribution-success').style.display = 'none';
                    }, 3000);
                } catch (error) {
                    alert('Failed to submit contribution');
                }
            }

            function shareEvent() {
                const url = window.location.href;
                navigator.clipboard.writeText(url).then(() => {
                    alert('Event link copied to clipboard!');
                }).catch(() => {
                    alert('Failed to copy link');
                });
            }

            loadEvent();
        </script>
    </body>
    </html>
  `);
});

// Event details page (for creator)
app.get('/event-details/:eventId', (c) => {
  const eventId = c.req.param('eventId');
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Event Details - Upsend</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50 min-h-screen">
        <nav class="bg-white shadow-sm">
            <div class="container mx-auto px-4 py-4">
                <div class="flex justify-between items-center">
                    <h1 class="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600">Upsend</h1>
                    <a href="/dashboard" class="text-gray-600 hover:text-gray-800">
                        <i class="fas fa-arrow-left mr-2"></i>Back to Dashboard
                    </a>
                </div>
            </div>
        </nav>

        <div class="container mx-auto px-4 py-8">
            <div class="max-w-6xl mx-auto" id="event-details">
                <div class="text-center py-12">
                    <div class="text-gray-400 text-lg">Loading event details...</div>
                </div>
            </div>
        </div>

        <script>
            axios.defaults.headers.common['Authorization'] = 'Bearer ' + localStorage.getItem('session_token');
            const eventId = '${eventId}';

            async function loadEventDetails() {
                try {
                    const response = await axios.get('/api/events/creator/' + eventId);
                    const { event, messages, contributions, total_contributions } = response.data;

                    document.getElementById('event-details').innerHTML = \`
                        <div class="mb-8">
                            <div class="flex justify-between items-start mb-4">
                                <div>
                                    <h2 class="text-3xl font-bold text-gray-800 mb-2">\${event.title}</h2>
                                    <p class="text-gray-600">
                                        <i class="far fa-calendar mr-2"></i>\${new Date(event.event_date).toLocaleDateString()}
                                    </p>
                                </div>
                                <button onclick="copyLink('\${event.shareable_link}')" class="px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors">
                                    <i class="fas fa-link mr-2"></i>Copy Event Link
                                </button>
                            </div>
                            
                            <div class="grid grid-cols-3 gap-4 mb-8">
                                <div class="bg-white rounded-lg shadow p-6 text-center">
                                    <div class="text-3xl font-bold text-purple-600">\${messages.length}</div>
                                    <div class="text-gray-600 mt-2">Messages</div>
                                </div>
                                <div class="bg-white rounded-lg shadow p-6 text-center">
                                    <div class="text-3xl font-bold text-pink-600">\${contributions.length}</div>
                                    <div class="text-gray-600 mt-2">Contributions</div>
                                </div>
                                <div class="bg-white rounded-lg shadow p-6 text-center">
                                    <div class="text-3xl font-bold text-green-600">$\${parseFloat(total_contributions).toFixed(2)}</div>
                                    <div class="text-gray-600 mt-2">Total Amount</div>
                                </div>
                            </div>
                        </div>

                        <div class="grid md:grid-cols-2 gap-8">
                            <div class="bg-white rounded-xl shadow-lg p-6">
                                <h3 class="text-2xl font-bold text-gray-800 mb-4">
                                    <i class="far fa-comment-dots mr-2 text-purple-600"></i>Messages
                                </h3>
                                <div class="space-y-4 max-h-96 overflow-y-auto">
                                    \${messages.length === 0 ? \`
                                        <p class="text-gray-500 text-center py-8">No messages yet</p>
                                    \` : messages.map(msg => \`
                                        <div class="bg-gray-50 rounded-lg p-4">
                                            <p class="font-semibold text-gray-800 mb-1">\${msg.user_name || 'Anonymous'}</p>
                                            <p class="text-gray-700 mb-2">\${msg.message_text}</p>
                                            <p class="text-xs text-gray-500">\${new Date(msg.created_at * 1000).toLocaleString()}</p>
                                        </div>
                                    \`).join('')}
                                </div>
                            </div>

                            <div class="bg-white rounded-xl shadow-lg p-6">
                                <h3 class="text-2xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-dollar-sign mr-2 text-pink-600"></i>Contributions
                                </h3>
                                <div class="space-y-4 max-h-96 overflow-y-auto">
                                    \${contributions.length === 0 ? \`
                                        <p class="text-gray-500 text-center py-8">No contributions yet</p>
                                    \` : contributions.map(cont => \`
                                        <div class="bg-gray-50 rounded-lg p-4 flex justify-between items-center">
                                            <div>
                                                <p class="font-semibold text-gray-800">\${cont.contributor_name || 'Anonymous'}</p>
                                                <p class="text-xs text-gray-500">\${new Date(cont.created_at * 1000).toLocaleString()}</p>
                                            </div>
                                            <div class="text-xl font-bold text-green-600">$\${parseFloat(cont.amount).toFixed(2)}</div>
                                        </div>
                                    \`).join('')}
                                </div>
                            </div>
                        </div>
                    \`;
                } catch (error) {
                    document.getElementById('event-details').innerHTML = \`
                        <div class="text-center py-12">
                            <div class="text-red-600 text-lg mb-4">Failed to load event details</div>
                            <a href="/dashboard" class="text-purple-600 hover:text-purple-700">Back to Dashboard</a>
                        </div>
                    \`;
                }
            }

            function copyLink(shareableLink) {
                const url = window.location.origin + '/event/' + shareableLink;
                navigator.clipboard.writeText(url);
                alert('Event link copied to clipboard!');
            }

            // Check auth and load
            axios.get('/api/auth/me')
                .then(() => loadEventDetails())
                .catch(() => window.location.href = '/auth');
        </script>
    </body>
    </html>
  `);
});

export default app;
