use std::{io, net::SocketAddr};

use serde::{Deserialize, Serialize};
use tokio::net::UdpSocket;

use crate::{ServerMetadata, Topology};

const DISCOVERY_QUERY_TYPE: &str = "playlink_discovery_query";
const DISCOVERY_RESPONSE_TYPE: &str = "playlink_discovery_response";
const DISCOVERY_VERSION: u8 = 1;
const MAX_DISCOVERY_PACKET_BYTES: usize = 2048;

#[derive(Debug, Deserialize)]
struct DiscoveryQuery {
    #[serde(rename = "type")]
    message_type: String,
    version: u8,
}

#[derive(Debug, Serialize)]
pub struct DiscoveryResponse {
    #[serde(rename = "type")]
    message_type: &'static str,
    version: u8,
    server_id: String,
    name: String,
    server_name: String,
    topology: Topology,
    http_port: u16,
    ws_path: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    public_http_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    public_ws_url: Option<String>,
}

impl DiscoveryResponse {
    fn from_metadata(metadata: &ServerMetadata) -> Self {
        Self {
            message_type: DISCOVERY_RESPONSE_TYPE,
            version: DISCOVERY_VERSION,
            server_id: metadata.server_id.clone(),
            name: metadata.name.clone(),
            server_name: metadata.name.clone(),
            topology: metadata.topology.clone(),
            http_port: metadata.bind_addr.port(),
            ws_path: metadata.websocket_path,
            public_http_url: metadata.public_http_url.clone(),
            public_ws_url: metadata.public_ws_url.clone(),
        }
    }
}

pub async fn spawn(metadata: ServerMetadata) -> io::Result<tokio::task::JoinHandle<()>> {
    let discovery_addr = SocketAddr::from(([0, 0, 0, 0], metadata.discovery.port));
    let socket = UdpSocket::bind(discovery_addr).await?;
    tracing::info!(addr = %discovery_addr, "playlink LAN discovery listening");

    Ok(tokio::spawn(async move {
        let mut buffer = [0_u8; MAX_DISCOVERY_PACKET_BYTES];
        let response = DiscoveryResponse::from_metadata(&metadata);

        loop {
            let Ok((size, peer)) = socket.recv_from(&mut buffer).await else {
                continue;
            };

            if !is_supported_query(&buffer[..size]) {
                tracing::debug!(%peer, "ignoring unsupported discovery query");
                continue;
            }

            let Ok(payload) = serde_json::to_vec(&response) else {
                tracing::warn!("failed to serialize discovery response");
                continue;
            };

            if let Err(error) = socket.send_to(&payload, peer).await {
                tracing::debug!(%peer, %error, "failed to send discovery response");
            }
        }
    }))
}

fn is_supported_query(bytes: &[u8]) -> bool {
    let Ok(query) = serde_json::from_slice::<DiscoveryQuery>(bytes) else {
        return false;
    };

    query.message_type == DISCOVERY_QUERY_TYPE && query.version == DISCOVERY_VERSION
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn supported_discovery_query_is_accepted() {
        let query = serde_json::to_vec(&json!({
            "type": "playlink_discovery_query",
            "version": 1
        }))
        .unwrap();

        assert!(is_supported_query(&query));
    }

    #[test]
    fn unsupported_discovery_query_is_rejected() {
        let query = serde_json::to_vec(&json!({
            "type": "other_query",
            "version": 1
        }))
        .unwrap();

        assert!(!is_supported_query(&query));
        assert!(!is_supported_query(b"not json"));
    }

    #[test]
    fn discovery_response_serializes_connection_metadata() {
        let metadata = ServerMetadata {
            server_id: "lan-host-id".to_string(),
            name: "LAN Host".to_string(),
            version: "0.1.0",
            topology: Topology::Host,
            bind_addr: SocketAddr::from(([0, 0, 0, 0], 7777)),
            websocket_path: "/ws",
            http_url: None,
            ws_url: Some("ws://192.168.1.20:7777/ws".to_string()),
            public_http_url: None,
            public_ws_url: Some("ws://192.168.1.20:7777/ws".to_string()),
            discovery: crate::DiscoveryConfig {
                enabled: true,
                method: Some("udp_broadcast".to_string()),
                port: 7778,
            },
        };

        let value = serde_json::to_value(DiscoveryResponse::from_metadata(&metadata)).unwrap();
        assert_eq!(value["type"], "playlink_discovery_response");
        assert_eq!(value["version"], 1);
        assert_eq!(value["server_id"], "lan-host-id");
        assert_eq!(value["name"], "LAN Host");
        assert_eq!(value["server_name"], "LAN Host");
        assert_eq!(value["topology"], "host");
        assert_eq!(value["http_port"], 7777);
        assert_eq!(value["ws_path"], "/ws");
        assert_eq!(value["public_ws_url"], "ws://192.168.1.20:7777/ws");
    }
}
