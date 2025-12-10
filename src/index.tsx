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

    // Return URL that will be served by our image endpoint
    const publicUrl = `/api/images/${key}`;
    
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

// Serve images from R2
app.get('/api/images/*', async (c) => {
  try {
    const key = c.req.path.replace('/api/images/', '');
    
    const object = await c.env.IMAGES.get(key);
    
    if (!object) {
      return c.notFound();
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('Image serving error:', error);
    return c.notFound();
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
                    <a href="/dashboard" class="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 cursor-pointer hover:opacity-80 transition-opacity">Upsend</a>
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
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-3xl font-bold text-gray-800">My Events</h2>
                    <a href="/create-event" class="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all">
                        <i class="fas fa-plus mr-2"></i>Create Event
                    </a>
                </div>

                <!-- Search Bar -->
                <div class="mb-6">
                    <div class="relative max-w-md">
                        <input 
                            type="text" 
                            id="search-input" 
                            placeholder="Search events by title, description, or date..." 
                            class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                            oninput="filterEvents()"
                        >
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    </div>
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

            let allEvents = [];

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
                    allEvents = response.data.events;
                    displayEvents(allEvents);
                } catch (error) {
                    console.error('Failed to load events:', error);
                }
            }

            function displayEvents(events) {
                const eventsContainer = document.getElementById('events-list');
                
                if (events.length === 0) {
                    const searchQuery = document.getElementById('search-input').value;
                    if (searchQuery) {
                        eventsContainer.innerHTML = \`
                            <div class="col-span-full text-center py-12">
                                <div class="text-gray-400 text-lg mb-4">No events found matching "\${searchQuery}"</div>
                                <button onclick="clearSearch()" class="text-purple-600 hover:text-purple-700 font-medium">Clear search</button>
                            </div>
                        \`;
                    } else {
                        eventsContainer.innerHTML = \`
                            <div class="col-span-full text-center py-12">
                                <div class="text-gray-400 text-lg mb-4">No events yet</div>
                                <a href="/create-event" class="text-purple-600 hover:text-purple-700 font-medium">Create your first event</a>
                            </div>
                        \`;
                    }
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
            }

            function filterEvents() {
                const searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
                
                if (!searchQuery) {
                    displayEvents(allEvents);
                    return;
                }

                const filteredEvents = allEvents.filter(event => {
                    const title = (event.title || '').toLowerCase();
                    const description = (event.description || '').toLowerCase();
                    const date = new Date(event.event_date).toLocaleDateString().toLowerCase();
                    
                    return title.includes(searchQuery) || 
                           description.includes(searchQuery) || 
                           date.includes(searchQuery);
                });

                displayEvents(filteredEvents);
            }

            function clearSearch() {
                document.getElementById('search-input').value = '';
                displayEvents(allEvents);
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
        <!-- Cropper.js for image cropping -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.css">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.js"></script>
    </head>
    <body class="bg-gray-50 min-h-screen">
        <nav class="bg-white shadow-sm">
            <div class="container mx-auto px-4 py-4">
                <div class="flex justify-between items-center">
                    <a href="/dashboard" class="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 cursor-pointer hover:opacity-80 transition-opacity">Upsend</a>
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
                        <label class="block text-gray-700 font-medium mb-2">Event Images (optional)</label>
                        <p class="text-sm text-gray-500 mb-3">Upload up to 5 images. First image will be the cover. Max 5MB per image.</p>
                        
                        <!-- Drag and Drop Zone -->
                        <div id="drop-zone" class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-500 transition-colors cursor-pointer">
                            <input type="file" id="cover_image" accept="image/*" multiple class="hidden">
                            <i class="fas fa-cloud-upload-alt text-4xl text-gray-400 mb-3"></i>
                            <p class="text-gray-600 mb-2">Drag & drop images here or click to browse</p>
                            <p class="text-sm text-gray-400">PNG, JPG, GIF up to 5MB each</p>
                        </div>
                        
                        <!-- Image Previews Grid -->
                        <div id="images-grid" class="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4" style="display:none;">
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

        <!-- Crop Modal -->
        <div id="crop-modal" class="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4" style="display:none;">
            <div class="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto">
                <div class="p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-2xl font-bold text-gray-800">Crop & Adjust Image</h3>
                        <button onclick="closeCropModal()" class="text-gray-500 hover:text-gray-700">
                            <i class="fas fa-times text-2xl"></i>
                        </button>
                    </div>
                    
                    <!-- Cropper Container -->
                    <div class="mb-4">
                        <img id="crop-image" style="max-width: 100%; display: block;">
                    </div>
                    
                    <!-- Crop Controls -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <button onclick="cropper.rotate(-45)" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg">
                            <i class="fas fa-undo mr-2"></i>Rotate Left
                        </button>
                        <button onclick="cropper.rotate(45)" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg">
                            <i class="fas fa-redo mr-2"></i>Rotate Right
                        </button>
                        <button onclick="cropper.scaleX(-cropper.getData().scaleX || -1)" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg">
                            <i class="fas fa-arrows-alt-h mr-2"></i>Flip H
                        </button>
                        <button onclick="cropper.scaleY(-cropper.getData().scaleY || -1)" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg">
                            <i class="fas fa-arrows-alt-v mr-2"></i>Flip V
                        </button>
                    </div>
                    
                    <!-- Aspect Ratio Options -->
                    <div class="mb-4">
                        <label class="block text-gray-700 font-medium mb-2">Aspect Ratio</label>
                        <div class="flex flex-wrap gap-2">
                            <button onclick="cropper.setAspectRatio(NaN)" class="px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg">
                                Free
                            </button>
                            <button onclick="cropper.setAspectRatio(1)" class="px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg">
                                1:1
                            </button>
                            <button onclick="cropper.setAspectRatio(16/9)" class="px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg">
                                16:9
                            </button>
                            <button onclick="cropper.setAspectRatio(4/3)" class="px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg">
                                4:3
                            </button>
                            <button onclick="cropper.setAspectRatio(3/2)" class="px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg">
                                3:2
                            </button>
                        </div>
                    </div>
                    
                    <!-- Zoom Control -->
                    <div class="mb-6">
                        <label class="block text-gray-700 font-medium mb-2">Zoom</label>
                        <div class="flex items-center gap-3">
                            <button onclick="cropper.zoom(-0.1)" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg">
                                <i class="fas fa-search-minus"></i>
                            </button>
                            <input type="range" min="-1" max="1" step="0.01" value="0" oninput="cropper.zoom(this.value - this.dataset.lastValue); this.dataset.lastValue = this.value;" data-last-value="0" class="flex-1">
                            <button onclick="cropper.zoom(0.1)" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg">
                                <i class="fas fa-search-plus"></i>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Action Buttons -->
                    <div class="flex gap-3">
                        <button onclick="closeCropModal()" class="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold">
                            Cancel
                        </button>
                        <button onclick="applyCrop()" class="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-semibold hover:shadow-lg">
                            Apply Crop
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <script>
            axios.defaults.headers.common['Authorization'] = 'Bearer ' + localStorage.getItem('session_token');

            let selectedFiles = [];
            const MAX_FILES = 5;
            const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

            // Drag and drop functionality
            const dropZone = document.getElementById('drop-zone');
            const fileInput = document.getElementById('cover_image');

            dropZone.addEventListener('click', () => fileInput.click());

            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('border-purple-500', 'bg-purple-50');
            });

            dropZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                dropZone.classList.remove('border-purple-500', 'bg-purple-50');
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('border-purple-500', 'bg-purple-50');
                const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                handleFiles(files);
            });

            fileInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                handleFiles(files);
            });

            let currentCroppingFile = null;
            let currentCroppingIndex = -1;
            let cropper = null;

            async function handleFiles(files) {
                for (const file of files) {
                    if (selectedFiles.length >= MAX_FILES) {
                        alert(\`Maximum \${MAX_FILES} images allowed\`);
                        break;
                    }

                    if (file.size > MAX_FILE_SIZE) {
                        alert(\`\${file.name} is too large. Max 5MB per image.\`);
                        continue;
                    }

                    // Open crop modal for each image
                    await openCropModal(file, selectedFiles.length);
                }

                document.getElementById('images-grid').style.display = selectedFiles.length > 0 ? 'grid' : 'none';
            }

            function openCropModal(file, index) {
                return new Promise((resolve) => {
                    currentCroppingFile = file;
                    currentCroppingIndex = index;
                    
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const cropImage = document.getElementById('crop-image');
                        cropImage.src = e.target.result;
                        
                        document.getElementById('crop-modal').style.display = 'flex';
                        
                        // Destroy previous cropper instance
                        if (cropper) {
                            cropper.destroy();
                        }
                        
                        // Initialize Cropper.js
                        cropper = new Cropper(cropImage, {
                            viewMode: 1,
                            dragMode: 'move',
                            aspectRatio: NaN,
                            autoCropArea: 1,
                            restore: false,
                            guides: true,
                            center: true,
                            highlight: true,
                            cropBoxMovable: true,
                            cropBoxResizable: true,
                            toggleDragModeOnDblclick: false,
                        });
                        
                        // Store resolve function for later use
                        window.cropResolve = resolve;
                    };
                    reader.readAsDataURL(file);
                });
            }

            function closeCropModal() {
                document.getElementById('crop-modal').style.display = 'none';
                if (cropper) {
                    cropper.destroy();
                    cropper = null;
                }
                if (window.cropResolve) {
                    window.cropResolve();
                }
            }

            async function applyCrop() {
                if (!cropper) return;
                
                // Get cropped canvas
                const canvas = cropper.getCroppedCanvas({
                    maxWidth: 1920,
                    maxHeight: 1920,
                    fillColor: '#fff',
                    imageSmoothingEnabled: true,
                    imageSmoothingQuality: 'high',
                });
                
                // Convert to blob and compress
                canvas.toBlob(async (blob) => {
                    // Create file from blob
                    const croppedFile = new File([blob], currentCroppingFile.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    });
                    
                    // Compress the cropped image
                    const compressedFile = await compressImage(croppedFile);
                    selectedFiles.push(compressedFile);
                    displayImagePreview(compressedFile, selectedFiles.length - 1);
                    
                    closeCropModal();
                }, 'image/jpeg', 0.85);
            }

            async function compressImage(file) {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            let width = img.width;
                            let height = img.height;

                            // Resize if larger than 1920px
                            const maxDimension = 1920;
                            if (width > maxDimension || height > maxDimension) {
                                if (width > height) {
                                    height = (height / width) * maxDimension;
                                    width = maxDimension;
                                } else {
                                    width = (width / height) * maxDimension;
                                    height = maxDimension;
                                }
                            }

                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, width, height);

                            canvas.toBlob((blob) => {
                                const compressedFile = new File([blob], file.name, {
                                    type: 'image/jpeg',
                                    lastModified: Date.now()
                                });
                                resolve(compressedFile);
                            }, 'image/jpeg', 0.85);
                        };
                        img.src = e.target.result;
                    };
                    reader.readAsDataURL(file);
                });
            }

            function displayImagePreview(file, index) {
                const grid = document.getElementById('images-grid');
                const reader = new FileReader();
                
                reader.onload = (e) => {
                    const div = document.createElement('div');
                    div.className = 'relative group';
                    div.innerHTML = \`
                        <img src="\${e.target.result}" class="w-full h-32 object-cover rounded-lg border-2 border-gray-200">
                        <div class="absolute top-2 left-2 bg-purple-600 text-white text-xs px-2 py-1 rounded">
                            \${index === 0 ? 'Cover' : \`Image \${index + 1}\`}
                        </div>
                        <button type="button" onclick="removeImage(\${index})" class="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <i class="fas fa-times text-xs"></i>
                        </button>
                        <div class="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                            \${(file.size / 1024).toFixed(0)}KB
                        </div>
                    \`;
                    grid.appendChild(div);
                };
                reader.readAsDataURL(file);
            }

            window.removeImage = function(index) {
                selectedFiles.splice(index, 1);
                const grid = document.getElementById('images-grid');
                grid.innerHTML = '';
                selectedFiles.forEach((file, i) => displayImagePreview(file, i));
                if (selectedFiles.length === 0) {
                    grid.style.display = 'none';
                }
            };

            document.getElementById('create-event-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const title = document.getElementById('title').value;
                const description = document.getElementById('description').value;
                const event_date = document.getElementById('event_date').value;
                const submitBtn = document.getElementById('submit-btn');
                const statusDiv = document.getElementById('upload-status');

                try {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Creating Event...';

                    // Upload all images
                    let cover_image_url = null;
                    const uploadedImages = [];

                    if (selectedFiles.length > 0) {
                        statusDiv.textContent = \`Uploading \${selectedFiles.length} image(s)...\`;
                        
                        for (let i = 0; i < selectedFiles.length; i++) {
                            statusDiv.textContent = \`Uploading image \${i + 1} of \${selectedFiles.length}...\`;
                            
                            const formData = new FormData();
                            formData.append('image', selectedFiles[i]);

                            const uploadResponse = await axios.post('/api/upload-image', formData, {
                                headers: {
                                    'Content-Type': 'multipart/form-data'
                                }
                            });

                            if (uploadResponse.data.success) {
                                uploadedImages.push({
                                    url: uploadResponse.data.url,
                                    key: uploadResponse.data.key,
                                    is_cover: i === 0 ? 1 : 0,
                                    display_order: i
                                });
                                
                                // First image is the cover
                                if (i === 0) {
                                    cover_image_url = uploadResponse.data.url;
                                }
                            }
                        }
                        
                        statusDiv.textContent = 'All images uploaded!';
                    }

                    // Create event
                    statusDiv.textContent = 'Creating event...';
                    const response = await axios.post('/api/events/create', {
                        title,
                        description: description || undefined,
                        event_date,
                        cover_image: cover_image_url || undefined,
                        images: uploadedImages
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

                    // Build image slideshow HTML
                    let imagesHTML = '';
                    if (event.images && event.images.length > 0) {
                        // Build image slides
                        let imageSlides = '';
                        for (let i = 0; i < event.images.length; i++) {
                            imageSlides += '<img src="' + event.images[i].image_url + '" class="w-full h-full object-cover flex-shrink-0" alt="Event image ' + (i + 1) + '">';
                        }
                        
                        // Build dot indicators
                        let dotIndicators = '';
                        for (let i = 0; i < event.images.length; i++) {
                            dotIndicators += '<button onclick="goToSlide(' + i + ')" class="slide-dot w-2 h-2 rounded-full bg-white ' + (i === 0 ? 'bg-opacity-100' : 'bg-opacity-50') + ' transition-all"></button>';
                        }
                        
                        // Build navigation HTML if multiple images
                        let navigationHTML = '';
                        if (event.images.length > 1) {
                            navigationHTML = \`
                                <!-- Navigation Arrows -->
                                <button onclick="previousSlide()" class="absolute left-4 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-3 transition-all">
                                    <i class="fas fa-chevron-left"></i>
                                </button>
                                <button onclick="nextSlide()" class="absolute right-4 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-3 transition-all">
                                    <i class="fas fa-chevron-right"></i>
                                </button>
                                <!-- Slide Indicators -->
                                <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                                    \` + dotIndicators + \`
                                </div>
                            \`;
                        }
                        
                        // Build slideshow HTML
                        imagesHTML = \`
                            <div class="relative w-full h-64 md:h-96 bg-gray-900 overflow-hidden">
                                <div id="slideshow-container" class="flex transition-transform duration-500 ease-out h-full">
                                    \` + imageSlides + \`
                                </div>
                                \` + navigationHTML + \`
                            </div>
                        \`;
                    } else if (event.cover_image) {
                        imagesHTML = \`<img src="\${event.cover_image}" class="w-full h-64 object-cover">\`;
                    } else {
                        imagesHTML = \`<div class="w-full h-64 bg-gradient-to-br from-purple-400 to-pink-400"></div>\`;
                    }

                    document.getElementById('event-content').innerHTML = \`
                        <div class="bg-white rounded-2xl shadow-xl overflow-hidden mb-8">
                            \${imagesHTML}
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
                                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                                            <input type="number" id="amount" step="0.01" min="0.01" class="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-600 focus:border-transparent" placeholder="0.00" required>
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
                            <button onclick="openShareModal()" class="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg shadow-md hover:shadow-xl transform hover:scale-105 transition-all">
                                <i class="fas fa-share-alt mr-2"></i>Share This Event
                            </button>
                        </div>
                    \`;

                    // Add share modal to the page
                    document.body.insertAdjacentHTML('beforeend', \`
                        <div id="share-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50" onclick="closeShareModal(event)">
                            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6" onclick="event.stopPropagation()">
                                <div class="flex justify-between items-center mb-6">
                                    <h3 class="text-2xl font-bold text-gray-800">Share This Event</h3>
                                    <button onclick="closeShareModal()" class="text-gray-400 hover:text-gray-600 text-2xl">×</button>
                                </div>
                                
                                <p class="text-gray-600 mb-6">Help spread the word about this event!</p>
                                
                                <!-- Copy Link -->
                                <div class="mb-4 p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                                    <input type="text" id="share-url" value="\${window.location.href}" readonly class="flex-1 bg-transparent text-gray-700 text-sm mr-2 outline-none">
                                    <button onclick="copyLink()" class="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors">
                                        <i class="fas fa-copy mr-1"></i>Copy
                                    </button>
                                </div>
                                
                                <!-- Social Sharing Grid -->
                                <div class="grid grid-cols-4 gap-3 mb-4">
                                    <!-- WhatsApp -->
                                    <button onclick="shareWhatsApp()" class="flex flex-col items-center p-3 bg-green-50 hover:bg-green-100 rounded-lg transition-colors group">
                                        <i class="fab fa-whatsapp text-3xl text-green-600 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">WhatsApp</span>
                                    </button>
                                    
                                    <!-- Facebook -->
                                    <button onclick="shareFacebook()" class="flex flex-col items-center p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors group">
                                        <i class="fab fa-facebook text-3xl text-blue-600 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">Facebook</span>
                                    </button>
                                    
                                    <!-- Instagram -->
                                    <button onclick="shareInstagram()" class="flex flex-col items-center p-3 bg-pink-50 hover:bg-pink-100 rounded-lg transition-colors group">
                                        <i class="fab fa-instagram text-3xl text-pink-600 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">Instagram</span>
                                    </button>
                                    
                                    <!-- Twitter/X -->
                                    <button onclick="shareTwitter()" class="flex flex-col items-center p-3 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors group">
                                        <i class="fab fa-twitter text-3xl text-sky-600 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">Twitter</span>
                                    </button>
                                    
                                    <!-- LinkedIn -->
                                    <button onclick="shareLinkedIn()" class="flex flex-col items-center p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors group">
                                        <i class="fab fa-linkedin text-3xl text-blue-700 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">LinkedIn</span>
                                    </button>
                                    
                                    <!-- Email -->
                                    <button onclick="shareEmail()" class="flex flex-col items-center p-3 bg-red-50 hover:bg-red-100 rounded-lg transition-colors group">
                                        <i class="fas fa-envelope text-3xl text-red-600 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">Email</span>
                                    </button>
                                    
                                    <!-- Telegram -->
                                    <button onclick="shareTelegram()" class="flex flex-col items-center p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors group">
                                        <i class="fab fa-telegram text-3xl text-blue-500 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">Telegram</span>
                                    </button>
                                    
                                    <!-- SMS -->
                                    <button onclick="shareSMS()" class="flex flex-col items-center p-3 bg-green-50 hover:bg-green-100 rounded-lg transition-colors group">
                                        <i class="fas fa-sms text-3xl text-green-600 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">SMS</span>
                                    </button>
                                    
                                    <!-- More Options -->
                                    <button onclick="shareNative()" class="flex flex-col items-center p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group">
                                        <i class="fas fa-share-nodes text-3xl text-gray-600 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">More</span>
                                    </button>
                                </div>
                                
                                <div id="copy-success" class="text-center text-green-600 font-medium mt-4" style="display:none;">
                                    <i class="fas fa-check-circle mr-1"></i>Link copied to clipboard!
                                </div>
                            </div>
                        </div>
                    \`);

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

            // Share modal functions
            let eventTitle = '';
            let eventDescription = '';

            function openShareModal() {
                document.getElementById('share-modal').classList.remove('hidden');
                document.getElementById('share-modal').classList.add('flex');
            }

            function closeShareModal(event) {
                if (!event || event.target.id === 'share-modal') {
                    document.getElementById('share-modal').classList.add('hidden');
                    document.getElementById('share-modal').classList.remove('flex');
                    document.getElementById('copy-success').style.display = 'none';
                }
            }

            function copyLink() {
                const url = document.getElementById('share-url').value;
                navigator.clipboard.writeText(url).then(() => {
                    document.getElementById('copy-success').style.display = 'block';
                    setTimeout(() => {
                        document.getElementById('copy-success').style.display = 'none';
                    }, 3000);
                }).catch(() => {
                    alert('Failed to copy link');
                });
            }

            function getShareText() {
                return \`Check out this event: \${eventTitle || 'Event'}\${eventDescription ? ' - ' + eventDescription : ''}\`;
            }

            function shareWhatsApp() {
                const text = encodeURIComponent(getShareText() + '\\n' + window.location.href);
                window.open(\`https://wa.me/?text=\${text}\`, '_blank');
            }

            function shareFacebook() {
                const url = encodeURIComponent(window.location.href);
                window.open(\`https://www.facebook.com/sharer/sharer.php?u=\${url}\`, '_blank');
            }

            function shareInstagram() {
                // Open Instagram website - they'll need to post manually
                window.open('https://www.instagram.com/', '_blank');
                // Also copy the link for easy pasting
                copyLink();
            }

            function shareTwitter() {
                const text = encodeURIComponent(getShareText());
                const url = encodeURIComponent(window.location.href);
                window.open(\`https://twitter.com/intent/tweet?text=\${text}&url=\${url}\`, '_blank');
            }

            function shareLinkedIn() {
                const url = encodeURIComponent(window.location.href);
                window.open(\`https://www.linkedin.com/sharing/share-offsite/?url=\${url}\`, '_blank');
            }

            function shareEmail() {
                const subject = encodeURIComponent(eventTitle || 'Check out this event!');
                const body = encodeURIComponent(getShareText() + '\\n\\n' + window.location.href);
                window.location.href = \`mailto:?subject=\${subject}&body=\${body}\`;
            }

            function shareTelegram() {
                const text = encodeURIComponent(getShareText());
                const url = encodeURIComponent(window.location.href);
                window.open(\`https://t.me/share/url?url=\${url}&text=\${text}\`, '_blank');
            }

            function shareSMS() {
                const text = encodeURIComponent(getShareText() + ' ' + window.location.href);
                window.location.href = \`sms:?body=\${text}\`;
            }

            function shareNative() {
                if (navigator.share) {
                    navigator.share({
                        title: eventTitle || 'Event',
                        text: getShareText(),
                        url: window.location.href
                    }).catch(() => {
                        // User cancelled or error occurred
                    });
                } else {
                    copyLink();
                }
            }

            // Store event data for sharing
            async function loadEventForSharing() {
                try {
                    const response = await axios.get('/api/events/' + shareableLink);
                    const { event } = response.data;
                    eventTitle = event.title;
                    eventDescription = event.description;
                } catch (error) {
                    console.error('Failed to load event data:', error);
                }
            }

            // Slideshow functionality
            let currentSlide = 0;
            let totalSlides = 0;
            let touchStartX = 0;
            let touchEndX = 0;

            function initializeSlideshow() {
                const container = document.getElementById('slideshow-container');
                if (!container) return;
                
                totalSlides = container.children.length;
                
                // Add touch/swipe support for mobile
                container.addEventListener('touchstart', (e) => {
                    touchStartX = e.changedTouches[0].screenX;
                });
                
                container.addEventListener('touchend', (e) => {
                    touchEndX = e.changedTouches[0].screenX;
                    handleSwipe();
                });
            }

            function handleSwipe() {
                const swipeThreshold = 50;
                if (touchEndX < touchStartX - swipeThreshold) {
                    // Swipe left - next slide
                    nextSlide();
                }
                if (touchEndX > touchStartX + swipeThreshold) {
                    // Swipe right - previous slide
                    previousSlide();
                }
            }

            function nextSlide() {
                currentSlide = (currentSlide + 1) % totalSlides;
                updateSlideshow();
            }

            function previousSlide() {
                currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
                updateSlideshow();
            }

            function goToSlide(index) {
                currentSlide = index;
                updateSlideshow();
            }

            function updateSlideshow() {
                const container = document.getElementById('slideshow-container');
                if (!container) return;
                
                const offset = -currentSlide * 100;
                container.style.transform = \`translateX(\${offset}%)\`;
                
                // Update dot indicators
                const dots = document.querySelectorAll('.slide-dot');
                dots.forEach((dot, idx) => {
                    if (idx === currentSlide) {
                        dot.classList.remove('bg-opacity-50');
                        dot.classList.add('bg-opacity-100');
                    } else {
                        dot.classList.remove('bg-opacity-100');
                        dot.classList.add('bg-opacity-50');
                    }
                });
            }

            loadEvent();
            loadEventForSharing();
            
            // Initialize slideshow after event loads
            setTimeout(initializeSlideshow, 500);
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
                    <a href="/dashboard" class="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 cursor-pointer hover:opacity-80 transition-opacity">Upsend</a>
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
                                <button onclick="openShareModal()" class="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg shadow-md hover:shadow-xl transform hover:scale-105 transition-all">
                                    <i class="fas fa-share-alt mr-2"></i>Share Event
                                </button>
                            </div>
                            
                            <div class="grid grid-cols-3 gap-2 sm:gap-4 mb-8">
                                <div class="bg-white rounded-lg shadow p-3 sm:p-6 text-center">
                                    <div class="text-xl sm:text-3xl font-bold text-purple-600">\${messages.length}</div>
                                    <div class="text-xs sm:text-base text-gray-600 mt-1 sm:mt-2">Messages</div>
                                </div>
                                <div class="bg-white rounded-lg shadow p-3 sm:p-6 text-center">
                                    <div class="text-xl sm:text-3xl font-bold text-pink-600">\${contributions.length}</div>
                                    <div class="text-xs sm:text-base text-gray-600 mt-1 sm:mt-2">Contributions</div>
                                </div>
                                <div class="bg-white rounded-lg shadow p-3 sm:p-6 text-center">
                                    <div class="text-lg sm:text-3xl font-bold text-green-600 break-all">$\${parseFloat(total_contributions).toFixed(2)}</div>
                                    <div class="text-xs sm:text-base text-gray-600 mt-1 sm:mt-2">Total Amount</div>
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

                    // Add share modal to the page
                    document.body.insertAdjacentHTML('beforeend', \`
                        <div id="share-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50" onclick="closeShareModal(event)">
                            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6" onclick="event.stopPropagation()">
                                <div class="flex justify-between items-center mb-6">
                                    <h3 class="text-2xl font-bold text-gray-800">Share This Event</h3>
                                    <button onclick="closeShareModal()" class="text-gray-400 hover:text-gray-600 text-2xl">×</button>
                                </div>
                                
                                <p class="text-gray-600 mb-6">Help spread the word about this event!</p>
                                
                                <!-- Copy Link -->
                                <div class="mb-4 p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                                    <input type="text" id="share-url" value="\${window.location.origin}/event/\${event.shareable_link}" readonly class="flex-1 bg-transparent text-gray-700 text-sm mr-2 outline-none">
                                    <button onclick="copyLinkFromModal()" class="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors">
                                        <i class="fas fa-copy mr-1"></i>Copy
                                    </button>
                                </div>
                                
                                <!-- Social Sharing Grid -->
                                <div class="grid grid-cols-4 gap-3 mb-4">
                                    <!-- WhatsApp -->
                                    <button onclick="shareWhatsApp()" class="flex flex-col items-center p-3 bg-green-50 hover:bg-green-100 rounded-lg transition-colors group">
                                        <i class="fab fa-whatsapp text-3xl text-green-600 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">WhatsApp</span>
                                    </button>
                                    
                                    <!-- Facebook -->
                                    <button onclick="shareFacebook()" class="flex flex-col items-center p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors group">
                                        <i class="fab fa-facebook text-3xl text-blue-600 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">Facebook</span>
                                    </button>
                                    
                                    <!-- Instagram -->
                                    <button onclick="shareInstagram()" class="flex flex-col items-center p-3 bg-pink-50 hover:bg-pink-100 rounded-lg transition-colors group">
                                        <i class="fab fa-instagram text-3xl text-pink-600 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">Instagram</span>
                                    </button>
                                    
                                    <!-- Twitter/X -->
                                    <button onclick="shareTwitter()" class="flex flex-col items-center p-3 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors group">
                                        <i class="fab fa-twitter text-3xl text-sky-600 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">Twitter</span>
                                    </button>
                                    
                                    <!-- LinkedIn -->
                                    <button onclick="shareLinkedIn()" class="flex flex-col items-center p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors group">
                                        <i class="fab fa-linkedin text-3xl text-blue-700 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">LinkedIn</span>
                                    </button>
                                    
                                    <!-- Email -->
                                    <button onclick="shareEmail()" class="flex flex-col items-center p-3 bg-red-50 hover:bg-red-100 rounded-lg transition-colors group">
                                        <i class="fas fa-envelope text-3xl text-red-600 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">Email</span>
                                    </button>
                                    
                                    <!-- Telegram -->
                                    <button onclick="shareTelegram()" class="flex flex-col items-center p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors group">
                                        <i class="fab fa-telegram text-3xl text-blue-500 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">Telegram</span>
                                    </button>
                                    
                                    <!-- SMS -->
                                    <button onclick="shareSMS()" class="flex flex-col items-center p-3 bg-green-50 hover:bg-green-100 rounded-lg transition-colors group">
                                        <i class="fas fa-sms text-3xl text-green-600 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">SMS</span>
                                    </button>
                                    
                                    <!-- More Options -->
                                    <button onclick="shareNative()" class="flex flex-col items-center p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group">
                                        <i class="fas fa-share-nodes text-3xl text-gray-600 group-hover:scale-110 transition-transform"></i>
                                        <span class="text-xs mt-2 text-gray-600">More</span>
                                    </button>
                                </div>
                                
                                <div id="copy-success" class="text-center text-green-600 font-medium mt-4" style="display:none;">
                                    <i class="fas fa-check-circle mr-1"></i>Link copied to clipboard!
                                </div>
                            </div>
                        </div>
                    \`);

                    // Store event data for sharing
                    eventTitle = event.title;
                    eventDescription = event.description;
                    shareableLink = event.shareable_link;
                } catch (error) {
                    document.getElementById('event-details').innerHTML = \`
                        <div class="text-center py-12">
                            <div class="text-red-600 text-lg mb-4">Failed to load event details</div>
                            <a href="/dashboard" class="text-purple-600 hover:text-purple-700">Back to Dashboard</a>
                        </div>
                    \`;
                }
            }

            // Share modal functions
            let eventTitle = '';
            let eventDescription = '';
            let shareableLink = '';

            function openShareModal() {
                document.getElementById('share-modal').classList.remove('hidden');
                document.getElementById('share-modal').classList.add('flex');
            }

            function closeShareModal(event) {
                if (!event || event.target.id === 'share-modal') {
                    document.getElementById('share-modal').classList.add('hidden');
                    document.getElementById('share-modal').classList.remove('flex');
                    document.getElementById('copy-success').style.display = 'none';
                }
            }

            function copyLinkFromModal() {
                const url = document.getElementById('share-url').value;
                navigator.clipboard.writeText(url).then(() => {
                    document.getElementById('copy-success').style.display = 'block';
                    setTimeout(() => {
                        document.getElementById('copy-success').style.display = 'none';
                    }, 3000);
                }).catch(() => {
                    alert('Failed to copy link');
                });
            }

            function getShareText() {
                return \`Check out this event: \${eventTitle || 'Event'}\${eventDescription ? ' - ' + eventDescription : ''}\`;
            }

            function getShareUrl() {
                return window.location.origin + '/event/' + shareableLink;
            }

            function shareWhatsApp() {
                const text = encodeURIComponent(getShareText() + '\\n' + getShareUrl());
                window.open(\`https://wa.me/?text=\${text}\`, '_blank');
            }

            function shareFacebook() {
                const url = encodeURIComponent(getShareUrl());
                window.open(\`https://www.facebook.com/sharer/sharer.php?u=\${url}\`, '_blank');
            }

            function shareInstagram() {
                window.open('https://www.instagram.com/', '_blank');
                copyLinkFromModal();
            }

            function shareTwitter() {
                const text = encodeURIComponent(getShareText());
                const url = encodeURIComponent(getShareUrl());
                window.open(\`https://twitter.com/intent/tweet?text=\${text}&url=\${url}\`, '_blank');
            }

            function shareLinkedIn() {
                const url = encodeURIComponent(getShareUrl());
                window.open(\`https://www.linkedin.com/sharing/share-offsite/?url=\${url}\`, '_blank');
            }

            function shareEmail() {
                const subject = encodeURIComponent(eventTitle || 'Check out this event!');
                const body = encodeURIComponent(getShareText() + '\\n\\n' + getShareUrl());
                window.location.href = \`mailto:?subject=\${subject}&body=\${body}\`;
            }

            function shareTelegram() {
                const text = encodeURIComponent(getShareText());
                const url = encodeURIComponent(getShareUrl());
                window.open(\`https://t.me/share/url?url=\${url}&text=\${text}\`, '_blank');
            }

            function shareSMS() {
                const text = encodeURIComponent(getShareText() + ' ' + getShareUrl());
                window.location.href = \`sms:?body=\${text}\`;
            }

            function shareNative() {
                if (navigator.share) {
                    navigator.share({
                        title: eventTitle || 'Event',
                        text: getShareText(),
                        url: getShareUrl()
                    }).catch(() => {
                        // User cancelled or error occurred
                    });
                } else {
                    copyLinkFromModal();
                }
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
