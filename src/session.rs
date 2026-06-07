use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Session {
    pub player_id: Uuid,
    pub player_name: Option<String>,
    pub room_id: Option<Uuid>,
}

impl Default for Session {
    fn default() -> Self {
        Self {
            player_id: Uuid::new_v4(),
            player_name: None,
            room_id: None,
        }
    }
}
