const fetch = require('node-fetch'); // wait, node 18+ has fetch built-in, but just in case
const WINDSOR_BASE = 'https://connectors.windsor.ai/all?api_key=d9f7d79cb45782770ad6eae3607377e0509a&fields=account_name,campaign,ad_name,date,clicks,datasource,source,spend,roas,conversions,purchases,leads,all_conversions,conversions_value,complete_registration,registrations,add_to_cart,cost_per_conversion,cost,keyword,search_term,impressions,results,cost_per_result,actions_total,action_values_total,actions_lead,actions_offsite_conversion_fb_pixel_lead,actions_onsite_conversion_messaging_conversation_started_7d,actions_offsite_conversion_fb_pixel_purchase,cost_per_action_type_lead,cost_per_action_type_offsite_conversion_fb_pixel_lead,cost_per_action_type_onsite_conversion_messaging_conversation_started_7d,cost_per_action_type_offsite_conversion_fb_pixel_purchase';

async function test() {
  const url = `${WINDSOR_BASE}&date_from=2026-05-04&date_to=2026-05-04`;
  console.log('Fetching:', url);
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Body length:', text.length);
    console.log('Snippet:', text.substring(0, 300));
  } catch (e) {
    console.error(e);
  }
}
test();
