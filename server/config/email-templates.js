// Email Template Functions for TownRanker Follow-ups

const formatBudget = (budget) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(budget);
};

const getPackageName = (budget) => {
    if (budget < 1000) return 'Starter Package';
    if (budget < 5000) return 'Growth Package';
    if (budget < 10000) return 'Professional Package';
    if (budget < 25000) return 'Business Package';
    return 'Enterprise Package';
};

const getProjectTypeDetails = (projectType) => {
    const details = {
        business: {
            name: 'Business Website',
            features: ['Professional design', 'SEO optimization', 'Contact forms', 'Google Maps integration', 'Mobile responsive', 'SSL certificate'],
            deliverables: ['5-10 page website', 'Admin dashboard', 'Analytics setup', '3 months support']
        },
        ecommerce: {
            name: 'E-Commerce Platform',
            features: ['Product catalog', 'Shopping cart', 'Payment gateway', 'Inventory management', 'Order tracking', 'Customer accounts'],
            deliverables: ['Full e-commerce site', 'Admin panel', 'Payment integration', '6 months support']
        },
        webapp: {
            name: 'Web Application',
            features: ['Custom functionality', 'User authentication', 'Database integration', 'API development', 'Real-time features', 'Cloud hosting'],
            deliverables: ['Custom web app', 'Documentation', 'API access', '12 months support']
        },
        landing: {
            name: 'Landing Page',
            features: ['High-converting design', 'A/B testing', 'Lead capture', 'Analytics tracking', 'Speed optimization', 'CTA optimization'],
            deliverables: ['Optimized landing page', 'Lead tracking', 'Analytics dashboard', '1 month support']
        }
    };
    return details[projectType] || details.business;
};

// 1-Hour Follow-up Email - Detailed Project Brief
const getOneHourFollowUpEmail = (lead) => {
    const firstName = lead.name.split(' ')[0];
    const projectDetails = getProjectTypeDetails(lead.projectType);
    const packageName = getPackageName(lead.budget);
    
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                <img src="https://townranker.com/images/townranker-logo.webp" alt="TownRanker Logo" style="height: 40px; margin-bottom: 15px; filter: brightness(0) invert(1);">
                <h1 style="color: white; margin: 0;">📋 Your Personalized Project Brief</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
                <h2 style="color: #1f2937;">Hi ${firstName},</h2>
                <p style="color: #4b5563; line-height: 1.6;">
                    As promised, here's your detailed project brief based on your requirements. We've carefully analyzed your needs and prepared a comprehensive plan.
                </p>
                
                <!-- Project Overview -->
                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #e5e7eb; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h3 style="color: #6366f1; margin-top: 0;">🎯 Project Overview</h3>
                    <p><strong>Project Type:</strong> ${projectDetails.name}</p>
                    <p><strong>Selected Package:</strong> ${packageName}</p>
                    <p><strong>Investment:</strong> ${formatBudget(lead.budget)}</p>
                    <p><strong>Timeline:</strong> ${lead.timeline === 'asap' ? 'Priority Delivery (ASAP)' : lead.timeline ? lead.timeline.replace('-', ' to ').charAt(0).toUpperCase() + lead.timeline.replace('-', ' to ').slice(1) : 'Flexible'}</p>
                </div>
                
                <!-- What's Included -->
                <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                    <h3 style="color: #1e40af; margin-top: 0;">✅ What's Included in Your Package</h3>
                    <ul style="color: #4b5563; line-height: 1.8;">
                        ${projectDetails.features.map(feature => `<li>${feature}</li>`).join('')}
                    </ul>
                </div>
                
                <!-- Deliverables -->
                <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
                    <h3 style="color: #065f46; margin-top: 0;">📦 Deliverables</h3>
                    <ul style="color: #4b5563; line-height: 1.8;">
                        ${projectDetails.deliverables.map(deliverable => `<li>${deliverable}</li>`).join('')}
                    </ul>
                </div>
                
                <!-- Development Process -->
                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h3 style="color: #6366f1; margin-top: 0;">🚀 Our Development Process</h3>
                    <div style="margin: 15px 0;">
                        <p style="margin: 10px 0;"><strong>Week 1:</strong> Discovery & Design</p>
                        <p style="margin: 10px 0; padding-left: 20px; color: #6b7280;">• Requirements gathering • Wireframing • Design mockups</p>
                        
                        <p style="margin: 10px 0;"><strong>Week 2-3:</strong> Development</p>
                        <p style="margin: 10px 0; padding-left: 20px; color: #6b7280;">• Frontend development • Backend setup • Feature implementation</p>
                        
                        <p style="margin: 10px 0;"><strong>Week 4:</strong> Testing & Launch</p>
                        <p style="margin: 10px 0; padding-left: 20px; color: #6b7280;">• Quality assurance • Performance optimization • Go live!</p>
                    </div>
                </div>
                
                <!-- Why TownRanker -->
                <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #92400e; margin-top: 0;">🏆 Why TownRanker?</h3>
                    <ul style="color: #78350f; line-height: 1.8;">
                        <li><strong>100% Money-Back Guarantee</strong> - Risk-free development</li>
                        <li><strong>2-Hour Response Time</strong> - Always available when you need us</li>
                        <li><strong>500+ Projects Delivered</strong> - Proven track record</li>
                        <li><strong>Lifetime Updates</strong> - Your site stays current</li>
                    </ul>
                </div>
                
                <!-- Special Offer -->
                ${lead.budget >= 5000 ? `
                <div style="background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: white; margin-top: 0; text-align: center;">🎁 Special Bonus for ${packageName}</h3>
                    <p style="color: white; text-align: center; margin: 10px 0;">
                        Book within 48 hours and receive <strong>FREE Google Ads Setup</strong> worth $500!
                    </p>
                </div>
                ` : ''}
                
                <!-- Next Steps -->
                <div style="background: #ede9fe; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #5b21b6; margin-top: 0;">📞 Ready to Move Forward?</h3>
                    <p style="color: #4b5563; line-height: 1.6;">
                        Our project specialist will be calling you shortly to discuss this brief and answer any questions.
                    </p>
                    <p style="color: #4b5563; line-height: 1.6;">
                        <strong>Can't wait?</strong> Call us directly at <a href="tel:+1234567890" style="color: #6366f1; text-decoration: none;">+1 (234) 567-890</a>
                    </p>
                </div>
                
                <p style="color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    <em>This proposal is valid for 7 days. Prices may vary after this period.</em>
                </p>
            </div>
            <div style="background: #1f2937; padding: 20px; text-align: center;">
                <p style="color: white; margin: 0; font-weight: bold;">Ready to Build Something Amazing?</p>
                <p style="color: #9ca3af; margin: 10px 0;">TownRanker - Where Ideas Become Digital Reality</p>
                <p style="color: #9ca3af; margin: 5px 0; font-size: 14px;">Premium Web Development & Digital Marketing</p>
                <p style="color: #9ca3af; margin: 10px 0; font-size: 12px;">
                    Lead ID: ${lead._id || 'TEST-' + Date.now()}
                </p>
                <p style="color: #9ca3af; margin: 10px 0; font-size: 11px;">
                    This email was sent by TownRanker &lt;hello@townranker.com&gt; | 
                    <a href="mailto:hello@townranker.com?subject=Unsubscribe&body=Please unsubscribe me from all marketing emails" style="color: #9ca3af;">Unsubscribe</a> | 
                    <a href="mailto:hello@townranker.com?subject=Update Preferences" style="color: #9ca3af;">Update Preferences</a>
                </p>
            </div>
        </div>
    `;
};

// 24-Hour Follow-up Email - Strategy Session Scheduling
const getTwentyFourHourFollowUpEmail = (lead) => {
    const firstName = lead.name.split(' ')[0];
    const packageName = getPackageName(lead.budget);
    
    // Generate available time slots for next 3 business days
    const getTimeSlots = () => {
        const slots = [];
        const today = new Date();
        let daysAdded = 0;
        
        while (slots.length < 3) {
            today.setDate(today.getDate() + 1);
            const dayOfWeek = today.getDay();
            
            // Skip weekends
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;
            
            const dayName = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
            slots.push(dayName);
            daysAdded++;
        }
        
        return slots;
    };
    
    const availableDays = getTimeSlots();
    
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                <img src="https://townranker.com/images/townranker-logo.webp" alt="TownRanker Logo" style="height: 40px; margin-bottom: 15px; filter: brightness(0) invert(1);">
                <h1 style="color: white; margin: 0;">🗓️ Schedule Your Strategy Session</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
                <h2 style="color: #1f2937;">Hi ${firstName},</h2>
                <p style="color: #4b5563; line-height: 1.6;">
                    It's time to schedule your personalized strategy session! This is where we'll dive deep into your project and create a roadmap for success.
                </p>
                
                <!-- Session Details -->
                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #e5e7eb;">
                    <h3 style="color: #6366f1; margin-top: 0;">📞 Your Strategy Session Includes:</h3>
                    <ul style="color: #4b5563; line-height: 1.8;">
                        <li><strong>30-minute video call</strong> with our senior developer</li>
                        <li><strong>Live screen sharing</strong> to show examples and mockups</li>
                        <li><strong>Custom recommendations</strong> for your specific needs</li>
                        <li><strong>Q&A session</strong> to address all your concerns</li>
                        <li><strong>Recorded session</strong> for your reference (optional)</li>
                    </ul>
                </div>
                
                <!-- Google Calendar Integration -->
                <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #1e40af; margin-top: 0;">📅 Book Your Strategy Session</h3>
                    <p style="color: #4b5563; margin-bottom: 20px;">Click below to see real-time availability and book instantly:</p>
                    
                    <!-- Primary Google Calendar Button -->
                    <div style="text-align: center; margin: 25px 0;">
                        <a href="${process.env.GOOGLE_CALENDAR_LINK || 'https://calendar.app.google/A5f973NtuW9gW67s5'}" 
                           style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                  color: white; 
                                  padding: 18px 40px; 
                                  border-radius: 10px; 
                                  text-decoration: none; 
                                  display: inline-block; 
                                  font-weight: bold;
                                  font-size: 18px;
                                  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
                                  transition: all 0.3s ease;">
                            📅 View Available Times & Book Now
                        </a>
                        <p style="color: #6b7280; font-size: 14px; margin-top: 15px;">
                            <strong>✓ Instant confirmation</strong> • <strong>✓ Google Calendar sync</strong> • <strong>✓ Reminder emails</strong>
                        </p>
                    </div>
                    
                    <!-- Alternative Options -->
                    <div style="background: white; padding: 15px; border-radius: 6px; margin-top: 20px;">
                        <p style="color: #4b5563; font-size: 14px; text-align: center; margin: 0;">
                            <strong>Prefer to schedule differently?</strong><br>
                            📞 Call: <a href="tel:+1234567890" style="color: #6366f1; text-decoration: none;">+1 (234) 567-890</a><br>
                            ✉️ Email: Reply with your preferred times<br>
                            💬 Text: Send "SCHEDULE" to (234) 567-890
                        </p>
                    </div>
                    
                    <!-- Available Hours Note -->
                    <p style="color: #6b7280; font-size: 13px; margin-top: 15px; text-align: center; font-style: italic;">
                        Available: Monday-Friday 9 AM - 5 PM EST • Same-day bookings available until 3 PM
                    </p>
                </div>
                
                <!-- What to Prepare -->
                <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #065f46; margin-top: 0;">📝 How to Prepare</h3>
                    <p style="color: #4b5563;">To make the most of our session, please have ready:</p>
                    <ul style="color: #4b5563; line-height: 1.8;">
                        <li>Examples of websites you like (for design reference)</li>
                        <li>Your logo or brand guidelines (if available)</li>
                        <li>Any specific features or functionality questions</li>
                        <li>Your target launch date preferences</li>
                    </ul>
                </div>
                
                <!-- Success Stories -->
                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h3 style="color: #6366f1; margin-top: 0;">⭐ What Our Clients Say</h3>
                    <div style="background: #f9fafb; padding: 15px; border-left: 3px solid #6366f1; margin: 15px 0;">
                        <p style="color: #4b5563; font-style: italic; margin: 0;">
                            "The strategy session was incredibly valuable. They understood our vision perfectly and delivered beyond expectations!"
                        </p>
                        <p style="color: #6b7280; font-size: 14px; margin-top: 10px;">
                            - Sarah M., ${packageName} Client
                        </p>
                    </div>
                    <div style="background: #f9fafb; padding: 15px; border-left: 3px solid #6366f1; margin: 15px 0;">
                        <p style="color: #4b5563; font-style: italic; margin: 0;">
                            "Professional, responsive, and delivered on time. The strategy session set the perfect foundation for our project."
                        </p>
                        <p style="color: #6b7280; font-size: 14px; margin-top: 10px;">
                            - Mike R., Business Owner
                        </p>
                    </div>
                </div>
                
                <!-- Urgency -->
                <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: white; margin-top: 0; text-align: center;">⏰ Limited Availability Alert</h3>
                    <p style="color: white; text-align: center; margin: 10px 0;">
                        We only take on <strong>5 new projects per month</strong> to ensure quality.
                        <br>Current availability: <strong>2 spots remaining</strong> for this month.
                    </p>
                </div>
                
                <!-- Direct Booking -->
                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://townranker.com/schedule" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: bold; font-size: 18px;">
                        Book Your Strategy Session Now →
                    </a>
                    <p style="color: #6b7280; font-size: 14px; margin-top: 15px;">
                        Or call directly: <a href="tel:+1234567890" style="color: #6366f1;">+1 (234) 567-890</a>
                    </p>
                </div>
                
                <!-- FAQ -->
                <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #92400e; margin-top: 0;">💡 Quick FAQ</h3>
                    <p style="color: #78350f; margin: 10px 0;">
                        <strong>Q: Is the strategy session free?</strong><br>
                        A: Yes, absolutely! No obligations.
                    </p>
                    <p style="color: #78350f; margin: 10px 0;">
                        <strong>Q: What if I need to reschedule?</strong><br>
                        A: No problem! Just reply to this email 2 hours before.
                    </p>
                    <p style="color: #78350f; margin: 10px 0;">
                        <strong>Q: Will I get a proposal after?</strong><br>
                        A: Yes, within 24 hours of our call.
                    </p>
                </div>
            </div>
            <div style="background: #1f2937; padding: 20px; text-align: center;">
                <p style="color: white; margin: 0; font-weight: bold;">Let's Turn Your Vision Into Reality</p>
                <p style="color: #9ca3af; margin: 10px 0;">TownRanker - Where Ideas Become Digital Reality</p>
                <p style="color: #9ca3af; margin: 5px 0; font-size: 14px;">Premium Web Development & Digital Marketing</p>
                <p style="color: #9ca3af; margin: 10px 0; font-size: 12px;">
                    Lead ID: ${lead._id || 'TEST-' + Date.now()}
                </p>
                <p style="color: #9ca3af; margin: 10px 0; font-size: 11px;">
                    This email was sent by TownRanker &lt;hello@townranker.com&gt; | 
                    <a href="mailto:hello@townranker.com?subject=Unsubscribe&body=Please unsubscribe me from all marketing emails" style="color: #9ca3af;">Unsubscribe</a> | 
                    <a href="mailto:hello@townranker.com?subject=Update Preferences" style="color: #9ca3af;">Update Preferences</a>
                </p>
            </div>
        </div>
    `;
};

module.exports = {
    getOneHourFollowUpEmail,
    getTwentyFourHourFollowUpEmail,
    formatBudget,
    getPackageName
};