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
    artificial_analysis_math_index?: number;
    mmlu_pro?: number;
    gpqa?: number;
    hle?: number;
    livecodebench?: number;
    scicode?: number;
    math_500?: number;
    aime?: number;
}

export interface AAPricing {
    price_1m_blended_3_to_1?: number;
    price_1m_input_tokens?: number;
    price_1m_output_tokens?: number;
}

export interface AALLMModel {
    id: string;
    name: string;
    slug: string;
    model_creator: AAModelCreator;
    evaluations?: AAEvaluations;
    pricing?: AAPricing;
    median_output_tokens_per_second?: number;
    median_time_to_first_token_seconds?: number;
    median_time_to_first_answer_token?: number;
}

export interface AAImageModel {
    id: string;
    name: string;
    slug: string;
    model_creator: AAModelCreator;
    elo?: number;
    rank?: number;
    ci95?: string;
    appearances?: number;
    release_date?: string;
}

export interface AABenchmarkData {
    llms: AALLMModel[];
    imageModels: AAImageModel[];
}
