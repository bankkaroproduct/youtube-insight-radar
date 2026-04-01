DELETE FROM video_links;
DELETE FROM video_keywords;
DELETE FROM videos;
DELETE FROM fetch_jobs;
DELETE FROM keywords_search_runs;
UPDATE channels SET total_videos_fetched = 0, platform_video_counts = '{}', retailer_video_counts = '{}', retailer_via_affiliate_counts = '{}', retailer_direct_counts = '{}', affiliate_names = '{}', affiliate_platform_names = '{}', retailer_names = '{}';