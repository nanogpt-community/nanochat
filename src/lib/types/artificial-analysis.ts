/**
 * TypeScript types for the Artificial Analysis API
 * https://artificialanalysis.ai/
 */

export interface AAModelCreator {
    id: string;
    name: string;
    slug?: string;
}

export interface AAEvaluations {
    artificial_analysis_intelligence_index?: number;
    artificial_analysis_coding_index?: number;
    artificial_analysis_agentic_index?: number;
}

export interface AAPricing {
    price_1m_blended_3_to_1?: number;
    price_1m_input_tokens?: number;
    price_1m_output_tokens?: number;
}

export interface AAPerformance {
    median_output_tokens_per_second?: number;
    median_time_to_first_token_seconds?: number;
    median_time_to_first_answer_token_seconds?: number;
    median_end_to_end_response_time_seconds?: number;
}

export interface AALLMModel {
    id: string;
    name: string;
    slug: string;
    release_date?: string | null;
    model_creator: AAModelCreator;
    evaluations?: AAEvaluations;
    pricing?: AAPricing;
    performance?: AAPerformance;
    // Flattened from performance by our benchmarks endpoint (legacy shape)
    median_output_tokens_per_second?: number;
    median_time_to_first_token_seconds?: number;
}

export interface AAImageModel {
    id: string;
    name: string;
    slug: string;
    model_creator: AAModelCreator;
    elo?: number;
    ci_95?: number | null;
    // Derived from Elo order by our benchmarks endpoint (not returned by the V2 API)
    rank?: number;
}

export interface AABenchmarkData {
    llms: AALLMModel[];
    imageModels: AAImageModel[];
}
