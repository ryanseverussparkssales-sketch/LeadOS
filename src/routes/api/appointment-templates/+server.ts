import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// Default question packs by vertical
export const DEFAULT_TEMPLATES: Record<string, { name: string; questions: any[] }> = {
	window_sales: {
		name: 'Window Sales',
		questions: [
			{ key: 'homeowner', label: 'Are you the homeowner?', type: 'yesno', required: true },
			{ key: 'address', label: 'Property address', type: 'text', required: true },
			{ key: 'window_count', label: 'How many windows need replacing?', type: 'select', options: ['1-2', '3-5', '6-10', '10+'], required: false },
			{ key: 'issue', label: "What's the issue?", type: 'select', options: ['Broken/cracked', 'Drafty/energy loss', 'Upgrade/cosmetic', 'New construction'], required: false },
			{ key: 'budget', label: 'Budget range', type: 'select', options: ['Under $2k', '$2k-$5k', '$5k-$15k', '$15k+', 'Not sure yet'], required: false },
			{ key: 'decision_makers', label: 'Any other decision makers?', type: 'text', required: false },
			{ key: 'urgency', label: 'How soon are you looking to move forward?', type: 'select', options: ['ASAP', 'Within 30 days', '1-3 months', 'Just exploring'], required: false },
		],
	},
	roofing: {
		name: 'Roof Damage Check',
		questions: [
			{ key: 'homeowner', label: 'Are you the homeowner?', type: 'yesno', required: true },
			{ key: 'address', label: 'Property address', type: 'text', required: true },
			{ key: 'damage_type', label: 'What type of damage?', type: 'select', options: ['Storm/hail', 'Wind', 'Leak/water damage', 'Age/wear', 'Other'], required: false },
			{ key: 'insurance', label: 'Have insurance?', type: 'yesno', required: false },
			{ key: 'insurance_carrier', label: 'Insurance carrier', type: 'text', required: false },
			{ key: 'claim_filed', label: 'Claim already filed?', type: 'yesno', required: false },
			{ key: 'urgency', label: 'Urgency level', type: 'select', options: ['Active leak - urgent', 'Need assessment ASAP', 'Planning ahead'], required: false },
		],
	},
	electrician: {
		name: 'Electrician Appointment',
		questions: [
			{ key: 'homeowner', label: 'Are you the homeowner or property manager?', type: 'yesno', required: true },
			{ key: 'address', label: 'Property address', type: 'text', required: true },
			{ key: 'job_type', label: 'Type of work needed', type: 'select', options: ['Light switches/outlets', 'Panel upgrade', 'Smart home install', 'New wiring', 'Troubleshooting/repair', 'Other'], required: true },
			{ key: 'smart_home', label: 'Interested in smart home products?', type: 'yesno', required: false },
			{ key: 'panel_age', label: 'How old is your electrical panel?', type: 'select', options: ['Under 10 years', '10-20 years', '20+ years', "Don't know"], required: false },
			{ key: 'urgency', label: 'How soon?', type: 'select', options: ['Emergency', 'Within a week', 'Within a month', 'Flexible'], required: false },
			{ key: 'permit_needed', label: 'Permit may be required — is that OK?', type: 'yesno', required: false },
		],
	},
	smart_home: {
		name: 'Smart Home Consultation',
		questions: [
			{ key: 'homeowner', label: 'Are you the homeowner?', type: 'yesno', required: true },
			{ key: 'address', label: 'Property address', type: 'text', required: true },
			{ key: 'products', label: 'Interested in which products?', type: 'multiselect', options: ['Smart switches/outlets', 'Smart lighting', 'Security cameras', 'Smart locks', 'Thermostat', 'Full automation'], required: false },
			{ key: 'current_system', label: 'Current smart home setup?', type: 'select', options: ['None', 'Basic (Alexa/Google)', 'Some smart devices', 'Full system'], required: false },
			{ key: 'budget', label: 'Budget range', type: 'select', options: ['Under $500', '$500-$2k', '$2k-$5k', '$5k+'], required: false },
			{ key: 'urgency', label: 'Timeline', type: 'select', options: ['ASAP', 'Within 30 days', '1-3 months', 'Just exploring'], required: false },
		],
	},
	general: {
		name: 'General Appointment',
		questions: [
			{ key: 'decision_maker', label: 'Are you the decision maker?', type: 'yesno', required: true },
			{ key: 'current_solution', label: 'What are you currently using?', type: 'text', required: false },
			{ key: 'pain_point', label: 'Main problem you need solved?', type: 'textarea', required: false },
			{ key: 'budget', label: 'Budget range', type: 'text', required: false },
			{ key: 'timeline', label: 'When are you looking to move forward?', type: 'select', options: ['ASAP', 'Within 30 days', '1-3 months', '3-6 months', 'Just exploring'], required: false },
			{ key: 'stakeholders', label: 'Anyone else involved in decision?', type: 'text', required: false },
		],
	},
};

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const campaignId = url.searchParams.get('campaign_id');

	const { data } = await supabaseAdmin
		.from('appointment_templates')
		.select('*')
		.eq('owner_user_id', ownerId)
		.order('created_at');

	// If requesting for a specific campaign and none found, return the general default
	const templates = data ?? [];
	const campaignTemplate = campaignId ? templates.find(t => t.campaign_id === campaignId) : null;

	return json({
		templates,
		campaignTemplate,
		defaults: DEFAULT_TEMPLATES,
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { campaignId, name, questions, durationMinutes, defaultFormat } = await request.json();

	const { data, error: e } = await supabaseAdmin
		.from('appointment_templates')
		.upsert({
			owner_user_id: ownerId,
			campaign_id: campaignId ?? null,
			name: name ?? 'Appointment',
			questions: questions ?? [],
			duration_minutes: durationMinutes ?? 30,
			default_format: defaultFormat ?? 'phone',
		}, { onConflict: 'owner_user_id,campaign_id' })
		.select().single();

	if (e) throw error(400, e.message);
	return json(data);
};
