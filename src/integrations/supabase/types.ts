export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      affiliate_patterns: {
        Row: {
          classification: string
          created_at: string
          id: string
          is_auto_discovered: boolean
          is_confirmed: boolean
          name: string
          pattern: string
          type: string
        }
        Insert: {
          classification?: string
          created_at?: string
          id?: string
          is_auto_discovered?: boolean
          is_confirmed?: boolean
          name: string
          pattern: string
          type?: string
        }
        Update: {
          classification?: string
          created_at?: string
          id?: string
          is_auto_discovered?: boolean
          is_confirmed?: boolean
          name?: string
          pattern?: string
          type?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      channel_categories: {
        Row: {
          business_aim: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          business_aim?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          business_aim?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      channels: {
        Row: {
          affiliate_names: string[] | null
          affiliate_platform_names: string[] | null
          affiliate_status: string | null
          channel_id: string
          channel_name: string
          channel_url: string | null
          contact_email: string | null
          country: string | null
          created_at: string
          custom_links: Json | null
          custom_links_scraped_at: string | null
          description: string | null
          id: string
          instagram_url: string | null
          is_relevant: boolean | null
          last_analyzed_at: string | null
          last_relevance_check_at: string | null
          last_uploads_page_token: string | null
          median_comments: number | null
          median_likes: number | null
          median_views: number | null
          platform_video_counts: Json | null
          relevance_reasoning: string | null
          retailer_direct_counts: Json | null
          retailer_names: string[] | null
          retailer_via_affiliate_counts: Json | null
          retailer_video_counts: Json | null
          scanned_at_youtube_total: number | null
          subscriber_count: number | null
          total_videos_fetched: number | null
          uploads_fully_scanned_at: string | null
          youtube_category: string | null
          youtube_longform_total: number | null
          youtube_total_videos: number | null
        }
        Insert: {
          affiliate_names?: string[] | null
          affiliate_platform_names?: string[] | null
          affiliate_status?: string | null
          channel_id: string
          channel_name: string
          channel_url?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string
          custom_links?: Json | null
          custom_links_scraped_at?: string | null
          description?: string | null
          id?: string
          instagram_url?: string | null
          is_relevant?: boolean | null
          last_analyzed_at?: string | null
          last_relevance_check_at?: string | null
          last_uploads_page_token?: string | null
          median_comments?: number | null
          median_likes?: number | null
          median_views?: number | null
          platform_video_counts?: Json | null
          relevance_reasoning?: string | null
          retailer_direct_counts?: Json | null
          retailer_names?: string[] | null
          retailer_via_affiliate_counts?: Json | null
          retailer_video_counts?: Json | null
          scanned_at_youtube_total?: number | null
          subscriber_count?: number | null
          total_videos_fetched?: number | null
          uploads_fully_scanned_at?: string | null
          youtube_category?: string | null
          youtube_longform_total?: number | null
          youtube_total_videos?: number | null
        }
        Update: {
          affiliate_names?: string[] | null
          affiliate_platform_names?: string[] | null
          affiliate_status?: string | null
          channel_id?: string
          channel_name?: string
          channel_url?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string
          custom_links?: Json | null
          custom_links_scraped_at?: string | null
          description?: string | null
          id?: string
          instagram_url?: string | null
          is_relevant?: boolean | null
          last_analyzed_at?: string | null
          last_relevance_check_at?: string | null
          last_uploads_page_token?: string | null
          median_comments?: number | null
          median_likes?: number | null
          median_views?: number | null
          platform_video_counts?: Json | null
          relevance_reasoning?: string | null
          retailer_direct_counts?: Json | null
          retailer_names?: string[] | null
          retailer_via_affiliate_counts?: Json | null
          retailer_video_counts?: Json | null
          scanned_at_youtube_total?: number | null
          subscriber_count?: number | null
          total_videos_fetched?: number | null
          uploads_fully_scanned_at?: string | null
          youtube_category?: string | null
          youtube_longform_total?: number | null
          youtube_total_videos?: number | null
        }
        Relationships: []
      }
      export_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          file_size_bytes: number | null
          id: string
          progress_message: string | null
          status: string
          storage_path: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          file_size_bytes?: number | null
          id?: string
          progress_message?: string | null
          status?: string
          storage_path?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          file_size_bytes?: number | null
          id?: string
          progress_message?: string | null
          status?: string
          storage_path?: string | null
          user_id?: string
        }
        Relationships: []
      }
      fetch_jobs: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          keyword: string
          keyword_id: string | null
          last_failure_reason: string | null
          max_attempts: number
          order_by: string
          published_after: string | null
          started_at: string | null
          status: string
          variations_searched: string[] | null
          videos_found: number | null
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          keyword: string
          keyword_id?: string | null
          last_failure_reason?: string | null
          max_attempts?: number
          order_by?: string
          published_after?: string | null
          started_at?: string | null
          status?: string
          variations_searched?: string[] | null
          videos_found?: number | null
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          keyword?: string
          keyword_id?: string | null
          last_failure_reason?: string | null
          max_attempts?: number
          order_by?: string
          published_after?: string | null
          started_at?: string | null
          status?: string
          variations_searched?: string[] | null
          videos_found?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fetch_jobs_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keywords_search_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_profiles: {
        Row: {
          affiliate_reasoning: string | null
          affiliate_score: string | null
          avg_post_comments: number | null
          avg_post_likes: number | null
          bio: string | null
          bio_links: string[] | null
          business_category: string | null
          channel_id: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          external_url: string | null
          follower_count: number | null
          following_count: number | null
          full_name: string | null
          id: string
          instagram_username: string
          is_business: boolean | null
          is_private: boolean | null
          post_count: number | null
          profile_pic_url: string | null
          recent_posts: Json | null
          scraped_at: string | null
          storefront_name: string | null
        }
        Insert: {
          affiliate_reasoning?: string | null
          affiliate_score?: string | null
          avg_post_comments?: number | null
          avg_post_likes?: number | null
          bio?: string | null
          bio_links?: string[] | null
          business_category?: string | null
          channel_id: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          external_url?: string | null
          follower_count?: number | null
          following_count?: number | null
          full_name?: string | null
          id?: string
          instagram_username: string
          is_business?: boolean | null
          is_private?: boolean | null
          post_count?: number | null
          profile_pic_url?: string | null
          recent_posts?: Json | null
          scraped_at?: string | null
          storefront_name?: string | null
        }
        Update: {
          affiliate_reasoning?: string | null
          affiliate_score?: string | null
          avg_post_comments?: number | null
          avg_post_likes?: number | null
          bio?: string | null
          bio_links?: string[] | null
          business_category?: string | null
          channel_id?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          external_url?: string | null
          follower_count?: number | null
          following_count?: number | null
          full_name?: string | null
          id?: string
          instagram_username?: string
          is_business?: boolean | null
          is_private?: boolean | null
          post_count?: number | null
          profile_pic_url?: string | null
          recent_posts?: Json | null
          scraped_at?: string | null
          storefront_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_profiles_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_access_logs: {
        Row: {
          action: string
          allowed: boolean
          created_at: string
          id: string
          ip_address: string
          user_id: string | null
        }
        Insert: {
          action: string
          allowed: boolean
          created_at?: string
          id?: string
          ip_address: string
          user_id?: string | null
        }
        Update: {
          action?: string
          allowed?: boolean
          created_at?: string
          id?: string
          ip_address?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ip_whitelist: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          ip_address: string
          is_active: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          ip_address: string
          is_active?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          ip_address?: string
          is_active?: boolean
        }
        Relationships: []
      }
      keyword_cache: {
        Row: {
          fetched_at: string
          keyword: string
          order_by: string
          published_after: string
          video_ids: Json | null
          videos_found: number | null
        }
        Insert: {
          fetched_at?: string
          keyword: string
          order_by?: string
          published_after: string
          video_ids?: Json | null
          videos_found?: number | null
        }
        Update: {
          fetched_at?: string
          keyword?: string
          order_by?: string
          published_after?: string
          video_ids?: Json | null
          videos_found?: number | null
        }
        Relationships: []
      }
      keywords_search_runs: {
        Row: {
          business_aim: string
          category: string
          created_at: string
          estimated_volume: string | null
          id: string
          keyword: string
          last_priority_fetch_at: string | null
          priority: string | null
          run_date: string
          source: string
          source_name: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          business_aim?: string
          category?: string
          created_at?: string
          estimated_volume?: string | null
          id?: string
          keyword: string
          last_priority_fetch_at?: string | null
          priority?: string | null
          run_date?: string
          source?: string
          source_name?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          business_aim?: string
          category?: string
          created_at?: string
          estimated_volume?: string | null
          id?: string
          keyword?: string
          last_priority_fetch_at?: string | null
          priority?: string | null
          run_date?: string
          source?: string
          source_name?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          key: string
          last_reset: string
          quota_limit: number
          requests_today: number
        }
        Insert: {
          key: string
          last_reset?: string
          quota_limit: number
          requests_today?: number
        }
        Update: {
          key?: string
          last_reset?: string
          quota_limit?: number
          requests_today?: number
        }
        Relationships: []
      }
      tracked_channels: {
        Row: {
          business_fit_score: number | null
          category: string | null
          channel_name: string
          channel_url: string
          created_at: string
          id: string
          status: string | null
          subscriber_count: number | null
          user_id: string
          video_count: number | null
        }
        Insert: {
          business_fit_score?: number | null
          category?: string | null
          channel_name: string
          channel_url: string
          created_at?: string
          id?: string
          status?: string | null
          subscriber_count?: number | null
          user_id: string
          video_count?: number | null
        }
        Update: {
          business_fit_score?: number | null
          category?: string | null
          channel_name?: string
          channel_url?: string
          created_at?: string
          id?: string
          status?: string | null
          subscriber_count?: number | null
          user_id?: string
          video_count?: number | null
        }
        Relationships: []
      }
      url_resolution_cache: {
        Row: {
          final_domain: string | null
          normalized_url: string
          resolution_method: string | null
          resolve_count: number
          resolved_at: string
          unshortened_url: string
        }
        Insert: {
          final_domain?: string | null
          normalized_url: string
          resolution_method?: string | null
          resolve_count?: number
          resolved_at?: string
          unshortened_url: string
        }
        Update: {
          final_domain?: string | null
          normalized_url?: string
          resolution_method?: string | null
          resolve_count?: number
          resolved_at?: string
          unshortened_url?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_keywords: {
        Row: {
          created_at: string
          id: string
          keyword_id: string
          search_rank: number | null
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          keyword_id: string
          search_rank?: number | null
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          keyword_id?: string
          search_rank?: number | null
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_keywords_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keywords_search_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_keywords_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_links: {
        Row: {
          affiliate_domain: string | null
          affiliate_platform: string | null
          affiliate_platform_id: string | null
          classification: string | null
          created_at: string
          domain: string | null
          id: string
          is_shortened: boolean | null
          last_resolution_error: string | null
          link_type: string | null
          matched_pattern_id: string | null
          original_domain: string | null
          original_url: string
          resolution_attempts: number | null
          resolution_status: string | null
          resolved_retailer: string | null
          resolved_retailer_domain: string | null
          retailer_pattern_id: string | null
          unshortened_url: string | null
          updated_at: string | null
          video_id: string
        }
        Insert: {
          affiliate_domain?: string | null
          affiliate_platform?: string | null
          affiliate_platform_id?: string | null
          classification?: string | null
          created_at?: string
          domain?: string | null
          id?: string
          is_shortened?: boolean | null
          last_resolution_error?: string | null
          link_type?: string | null
          matched_pattern_id?: string | null
          original_domain?: string | null
          original_url: string
          resolution_attempts?: number | null
          resolution_status?: string | null
          resolved_retailer?: string | null
          resolved_retailer_domain?: string | null
          retailer_pattern_id?: string | null
          unshortened_url?: string | null
          updated_at?: string | null
          video_id: string
        }
        Update: {
          affiliate_domain?: string | null
          affiliate_platform?: string | null
          affiliate_platform_id?: string | null
          classification?: string | null
          created_at?: string
          domain?: string | null
          id?: string
          is_shortened?: boolean | null
          last_resolution_error?: string | null
          link_type?: string | null
          matched_pattern_id?: string | null
          original_domain?: string | null
          original_url?: string
          resolution_attempts?: number | null
          resolution_status?: string | null
          resolved_retailer?: string | null
          resolved_retailer_domain?: string | null
          retailer_pattern_id?: string | null
          unshortened_url?: string | null
          updated_at?: string | null
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_links_matched_pattern_id_fkey"
            columns: ["matched_pattern_id"]
            isOneToOne: false
            referencedRelation: "affiliate_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_links_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          channel_id: string
          channel_name: string
          comment_count: number | null
          created_at: string
          description: string | null
          id: string
          keyword_id: string | null
          like_count: number | null
          published_at: string | null
          thumbnail_url: string | null
          title: string
          video_id: string
          view_count: number | null
        }
        Insert: {
          channel_id: string
          channel_name: string
          comment_count?: number | null
          created_at?: string
          description?: string | null
          id?: string
          keyword_id?: string | null
          like_count?: number | null
          published_at?: string | null
          thumbnail_url?: string | null
          title: string
          video_id: string
          view_count?: number | null
        }
        Update: {
          channel_id?: string
          channel_name?: string
          comment_count?: number | null
          created_at?: string
          description?: string | null
          id?: string
          keyword_id?: string | null
          like_count?: number | null
          published_at?: string | null
          thumbnail_url?: string | null
          title?: string
          video_id?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keywords_search_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_api_keys: {
        Row: {
          api_key_encrypted: string | null
          api_key_last_4: string | null
          created_at: string
          daily_quota_limit: number
          id: string
          is_active: boolean
          label: string | null
          last_test_status: string | null
          last_tested_at: string | null
          last_used_at: string | null
          quota_reset_at: string | null
          quota_used_today: number
        }
        Insert: {
          api_key_encrypted?: string | null
          api_key_last_4?: string | null
          created_at?: string
          daily_quota_limit?: number
          id?: string
          is_active?: boolean
          label?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          last_used_at?: string | null
          quota_reset_at?: string | null
          quota_used_today?: number
        }
        Update: {
          api_key_encrypted?: string | null
          api_key_last_4?: string | null
          created_at?: string
          daily_quota_limit?: number
          id?: string
          is_active?: boolean
          label?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          last_used_at?: string | null
          quota_reset_at?: string | null
          quota_used_today?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_url_cache: { Args: never; Returns: number }
      get_affiliate_classification_stats: {
        Args: never
        Returns: {
          classification: string
          count: number
        }[]
      }
      get_channel_growth_stats: {
        Args: never
        Returns: {
          added_last_24h: number
          added_last_hour: number
          last_channel_at: string
          total_channels: number
        }[]
      }
      get_channel_summary_stats: {
        Args: never
        Returns: {
          competitor: number
          mixed: number
          neutral: number
          total: number
          with_us: number
        }[]
      }
      get_channels_needing_backfill: { Args: never; Returns: number }
      get_decrypted_api_key: {
        Args: { _key_id: string; _secret: string }
        Returns: string
      }
      get_keyword_stats: {
        Args: never
        Returns: {
          keyword_id: string
          link_count: number
          video_count: number
        }[]
      }
      get_video_links_processing_stats: {
        Args: never
        Returns: {
          failed: number
          pending: number
          processed: number
          total: number
          with_platform: number
          with_retailer: number
        }[]
      }
      get_video_links_stats: {
        Args: { video_ids?: string[] }
        Returns: {
          total: number
          unique_platforms: number
          unique_retailers: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      insert_encrypted_api_key: {
        Args: { _label: string; _raw_key: string; _secret: string }
        Returns: string
      }
      log_audit: {
        Args: {
          _action: string
          _details: Json
          _target_id: string
          _target_type: string
        }
        Returns: undefined
      }
      replace_user_role: {
        Args: {
          _new_role: Database["public"]["Enums"]["app_role"]
          _target_user_id: string
        }
        Returns: undefined
      }
      reset_daily_quotas: { Args: never; Returns: undefined }
      reset_daily_quotas_if_stale: { Args: never; Returns: boolean }
      search_videos_filtered: {
        Args: {
          _channel_q?: string
          _classification?: string
          _keyword_q?: string
          _limit?: number
          _offset?: number
          _title_q?: string
        }
        Returns: {
          id: string
          total_count: number
        }[]
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "manager" | "analyst" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "manager", "analyst", "viewer"],
    },
  },
} as const
