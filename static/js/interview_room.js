// Interview Room WebRTC Implementation
class InterviewRoom {
    constructor(roomId, roomCode, userRole, username) {
        this.roomId = roomId;
        this.roomCode = roomCode;
        this.userRole = userRole;
        this.username = username;
        this.localStream = null;
        this.screenStream = null;
        this.peers = {}; // sid -> RTCPeerConnection
        this.remoteStreams = {}; // sid -> MediaStream
        this.sidToUsername = {}; // sid -> username for UI
        this.socket = io();
        this.isMuted = false;
        this.isVideoOff = false;
        this.isScreenSharing = false;
        this.currentMainVideoSid = null; // Track whose video is in main view
        
        console.log('Interview room initialized:', { roomId, roomCode, userRole, username });
        
        this.initializeSocket();
        this.initializeUI();
    }

    initializeSocket() {
        // Join the interview room
        this.socket.emit('join_interview', {
            room: this.roomId,
            room_code: this.roomCode,
            role: this.userRole
        });

        // Handle existing participants
        this.socket.on('participants', (data) => {
            console.log('Received participants:', data.participants);
            const list = Array.isArray(data.participants) ? data.participants : [];
            
            // Add users to list first
            list.forEach(p => {
                this.sidToUsername[p.sid] = p.username;
            });
            
            // Then create offers with proper delay
            list.forEach(p => {
                setTimeout(() => {
                    this.createOffer(p.sid);
                }, 1500);
            });
        });

        // Handle user joined
        this.socket.on('user_joined', (data) => {
            if (!data || !data.sid) return;
            if (data.sid === this.socket.id) return; // ignore self
            
            console.log('User joined:', data.username, data.sid);
            this.sidToUsername[data.sid] = data.username;
            
            // Create offer for new peer with proper timing
            setTimeout(() => {
                this.createOffer(data.sid);
            }, 2000);
        });

        // Handle user left
        this.socket.on('user_left', (data) => {
            if (!data || !data.sid) return;
            console.log('User left:', data.username, data.sid);
            this.removePeer(data.sid);
            delete this.sidToUsername[data.sid];
            delete this.remoteStreams[data.sid];
            
            // If the main video was showing this user, clear it
            if (this.currentMainVideoSid === data.sid) {
                this.clearMainVideo();
            }
        });

        // WebRTC signaling
        this.socket.on('offer', (data) => {
            if (!data || !data.from) return;
            console.log('Received offer from:', data.from);
            this.handleOffer(data.offer, data.from);
        });

        this.socket.on('answer', (data) => {
            if (!data || !data.from) return;
            console.log('Received answer from:', data.from);
            this.handleAnswer(data.answer, data.from);
        });

        this.socket.on('ice_candidate', (data) => {
            if (!data || !data.from) return;
            console.log('Received ICE candidate from:', data.from);
            this.handleIceCandidate(data.candidate, data.from);
        });
        
        // Chat messages
        this.socket.on('chat_message', (data) => {
            if (typeof addChatMessage === 'function') {
                addChatMessage(data.username, data.message, false);
            }
        });
    }

    initializeUI() {
        // Get DOM elements
        this.localVideo = document.getElementById('localVideo');
        this.mainVideo = document.getElementById('mainVideo');
        this.mainVideoLabel = document.getElementById('mainVideoLabel');
        this.mainVideoContainer = document.getElementById('mainVideoContainer');
        this.noRemoteMessage = document.getElementById('noRemoteMessage');
        this.muteBtn = document.getElementById('muteBtn');
        this.videoToggleBtn = document.getElementById('videoToggleBtn');
        this.screenShareBtn = document.getElementById('screenShareBtn');
        this.codeEditorBtn = document.getElementById('codeEditorBtn');
        this.endCallBtn = document.getElementById('endCallBtn');

        // Add event listeners
        if (this.muteBtn) this.muteBtn.addEventListener('click', () => this.toggleMute());
        if (this.videoToggleBtn) this.videoToggleBtn.addEventListener('click', () => this.toggleVideo());
        if (this.screenShareBtn) this.screenShareBtn.addEventListener('click', () => this.toggleScreenShare());
        if (this.codeEditorBtn) this.codeEditorBtn.addEventListener('click', () => this.openCodeEditor());
        if (this.endCallBtn) this.endCallBtn.addEventListener('click', () => this.endCall());

        // Initialize local video
        this.startLocalVideo();
    }

    async startLocalVideo() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            if (this.localVideo) {
                this.localVideo.srcObject = this.localStream;
                this.localVideo.play().catch(e => console.log('Local video autoplay prevented'));
            }
            console.log('Local video started');
        } catch (error) {
            console.error('Error accessing media devices:', error);
            // Try audio-only fallback
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: false
                });
                console.log('Audio-only mode activated');
            } catch (audioError) {
                console.error('Error accessing audio:', audioError);
                alert('Please allow camera and microphone access to participate in the interview');
            }
        }
    }

    async createPeerConnection(sid) {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };

        const peerConnection = new RTCPeerConnection(configuration);

        // Add local stream tracks FIRST
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                console.log('Adding local track:', track.kind, 'to peer:', sid);
                peerConnection.addTrack(track, this.localStream);
            });
        }

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log(`Connection state with ${sid}:`, peerConnection.connectionState);
            if (peerConnection.connectionState === 'failed') {
                console.log('Connection failed, attempting to restart ICE');
                peerConnection.restartIce();
            }
        };

        // Handle ICE connection state
        peerConnection.oniceconnectionstatechange = () => {
            console.log(`ICE connection state with ${sid}:`, peerConnection.iceConnectionState);
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Sending ICE candidate to:', sid);
                this.socket.emit('ice_candidate', {
                    to: sid,
                    candidate: event.candidate
                });
            } else {
                console.log('All ICE candidates sent for:', sid);
            }
        };

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log('Received remote track from:', sid, 'kind:', event.track.kind);
            if (event.streams && event.streams[0]) {
                this.setRemoteVideo(sid, event.streams[0]);
            }
        };

        return peerConnection;
    }

    async createOffer(sid) {
        let peerConnection = this.peers[sid];
        if (!peerConnection) {
            peerConnection = await this.createPeerConnection(sid);
            this.peers[sid] = peerConnection;
        }

        try {
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            await peerConnection.setLocalDescription(offer);
            
            console.log('Sending offer to:', sid);
            this.socket.emit('offer', { 
                to: sid, 
                offer: offer 
            });
        } catch (error) {
            console.error('Error creating offer for', sid, error);
        }
    }

    async handleOffer(offer, fromSid) {
        let peerConnection = this.peers[fromSid];
        if (!peerConnection) {
            peerConnection = await this.createPeerConnection(fromSid);
            this.peers[fromSid] = peerConnection;
        }

        try {
            const remoteDesc = new RTCSessionDescription(offer);
            
            if (peerConnection.signalingState === 'have-local-offer') {
                await peerConnection.setLocalDescription({ type: 'rollback' });
            }
            
            await peerConnection.setRemoteDescription(remoteDesc);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            console.log('Sending answer to:', fromSid);
            this.socket.emit('answer', { 
                to: fromSid, 
                answer: answer 
            });
        } catch (error) {
            console.error('Error handling offer from', fromSid, error);
        }
    }

    async handleAnswer(answer, fromSid) {
        const peerConnection = this.peers[fromSid];
        if (peerConnection) {
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('Answer processed for:', fromSid);
            } catch (error) {
                console.error('Error handling answer from', fromSid, error);
            }
        }
    }

    async handleIceCandidate(candidate, fromSid) {
        const peerConnection = this.peers[fromSid];
        if (peerConnection && peerConnection.remoteDescription) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('ICE candidate added for:', fromSid);
            } catch (error) {
                console.error('Error adding ICE candidate from', fromSid, error);
            }
        }
    }

    // Set remote video in main view
    setRemoteVideo(sid, stream) {
        console.log('Setting remote video for:', sid);
        
        // Store the stream
        this.remoteStreams[sid] = stream;
        
        // Show in main video
        if (this.mainVideo) {
            this.mainVideo.srcObject = stream;
            this.mainVideo.style.display = 'block';
            this.mainVideo.play().catch(e => console.log('Remote video autoplay prevented'));
        }
        
        // Update label
        const username = this.sidToUsername[sid] || 'Participant';
        if (this.mainVideoLabel) {
            this.mainVideoLabel.textContent = username;
            this.mainVideoLabel.style.display = 'block';
        }
        
        // Hide waiting message
        if (this.noRemoteMessage) {
            this.noRemoteMessage.style.display = 'none';
        }
        
        this.currentMainVideoSid = sid;
        console.log('Remote video set successfully for:', sid);
    }
    
    clearMainVideo() {
        if (this.mainVideo) {
            this.mainVideo.srcObject = null;
            this.mainVideo.style.display = 'none';
        }
        if (this.mainVideoLabel) {
            this.mainVideoLabel.style.display = 'none';
        }
        if (this.noRemoteMessage) {
            this.noRemoteMessage.style.display = 'block';
        }
        this.currentMainVideoSid = null;
    }

    removePeer(sid) {
        if (this.peers[sid]) {
            this.peers[sid].close();
            delete this.peers[sid];
            console.log('Peer connection closed for:', sid);
        }
    }

    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isMuted = !audioTrack.enabled;
                
                if (this.muteBtn) {
                    this.muteBtn.innerHTML = this.isMuted ? 
                        '<i class="fas fa-microphone-slash"></i>' : 
                        '<i class="fas fa-microphone"></i>';
                    this.muteBtn.classList.toggle('muted', this.isMuted);
                }
            }
        }
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.isVideoOff = !videoTrack.enabled;
                
                if (this.videoToggleBtn) {
                    this.videoToggleBtn.innerHTML = this.isVideoOff ? 
                        '<i class="fas fa-video-slash"></i>' : 
                        '<i class="fas fa-video"></i>';
                    this.videoToggleBtn.classList.toggle('off', this.isVideoOff);
                }
            }
        }
    }

    async toggleScreenShare() {
        if (!this.isScreenSharing) {
            try {
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });

                // Replace video track in all peer connections
                const videoTrack = this.screenStream.getVideoTracks()[0];
                for (const [sid, peerConnection] of Object.entries(this.peers)) {
                    const sender = peerConnection.getSenders().find(s => 
                        s.track && s.track.kind === 'video'
                    );
                    if (sender) {
                        await sender.replaceTrack(videoTrack);
                    }
                }

                // Update local video
                if (this.localVideo) {
                    this.localVideo.srcObject = this.screenStream;
                }

                this.isScreenSharing = true;
                if (this.screenShareBtn) {
                    this.screenShareBtn.classList.add('active');
                }

                // Handle screen share ending
                videoTrack.onended = () => {
                    this.stopScreenShare();
                };
            } catch (error) {
                console.error('Error starting screen share:', error);
            }
        } else {
            this.stopScreenShare();
        }
    }

    async stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        // Replace screen share track with camera track
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            for (const [sid, peerConnection] of Object.entries(this.peers)) {
                const sender = peerConnection.getSenders().find(s => 
                    s.track && s.track.kind === 'video'
                );
                if (sender && videoTrack) {
                    await sender.replaceTrack(videoTrack);
                }
            }

            // Update local video
            if (this.localVideo) {
                this.localVideo.srcObject = this.localStream;
            }
        }

        this.isScreenSharing = false;
        if (this.screenShareBtn) {
            this.screenShareBtn.classList.remove('active');
        }
    }

    openCodeEditor() {
        // Open code editor in a new tab
        const codeEditorUrl = `/interview/${this.roomCode}/code-editor`;
        window.open(codeEditorUrl, '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    }
    
    // Send chat message
    sendChat(message) {
        this.socket.emit('chat_message', {
            room: this.roomId,
            message: message
        });
    }

    endCall() {
        if (!confirm('Are you sure you want to leave this interview?')) return;
        
        // Clean up all peer connections
        Object.values(this.peers).forEach(pc => pc.close());
        this.peers = {};

        // Stop all tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
        }

        // Leave socket room
        this.socket.emit('leave_interview', { room: this.roomId });

        // Redirect based on role
        if (this.userRole === 'interviewer') {
            window.location.href = '/interviewer/dashboard';
        } else {
            window.location.href = '/candidate/interviews';
        }
    }

    // Debug function
    debugConnections() {
        console.log('=== Connection Debug Info ===');
        console.log('Local stream:', this.localStream);
        console.log('Number of peers:', Object.keys(this.peers).length);
        console.log('Remote streams:', Object.keys(this.remoteStreams).length);
        
        Object.entries(this.peers).forEach(([sid, pc]) => {
            console.log(`Peer ${sid}:`);
            console.log('  Connection State:', pc.connectionState);
            console.log('  ICE Connection State:', pc.iceConnectionState);
            console.log('  Signaling State:', pc.signalingState);
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Get room data from template
    const roomData = window.interviewRoomData;
    if (roomData) {
        window.interviewRoom = new InterviewRoom(
            roomData.roomId,
            roomData.roomCode,
            roomData.userRole,
            roomData.username
        );
        
        // Expose debug function globally
        window.debugConnections = () => window.interviewRoom.debugConnections();
        
        console.log('Interview room initialized successfully');
    } else {
        console.error('Room data not found!');
    }
});