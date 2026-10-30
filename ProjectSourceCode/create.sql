CREATE TABLE IF NOT EXISTS users (
    user_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    username VARCHAR(50) UNIQUE NOT NULL,

    email VARCHAR(255) NOT NULL,

    password_hash VARCHAR(60) NOT NULL,
    
    auth_token VARCHAR(32) UNIQUE NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS templates (
    template_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    template_name VARCHAR(50) NOT NULL,

    template_desc VARCHAR(255) NOT NULL,

    template_data JSONB,

    share_id VARCHAR(32) UNIQUE,

    user_id INT REFERENCES users(user_id),
    
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS characters (
    character_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    character_name VARCHAR(50) NOT NULL,

    user_id INT REFERENCES users(user_id),

    template_id INT REFERENCES templates(template_id),
    
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_library (
    library_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id INT REFERENCES users(user_id),

    template_id INT REFERENCES templates(template_id),

    character_id INT REFERENCES characters(character_id),
    
    added_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
