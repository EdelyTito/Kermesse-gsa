const { createApp } = Vue;

// URL automática - funciona en cualquier entorno
let backendURL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000' 
    : 'https://kermesse-gsa.up.railway.app';

createApp({
    data() {
        return {
            vista: 'admin',
            platos: [],
            venta: {
                equipo: '',
                cantidades: {}
            },
            ventasPorEquipo: {},
            loading: false,
            backendURL: backendURL,
            estadoConexion: '🔄 Conectando...'
        }
    },
    async mounted() {
        console.log('🔗 Conectando a:', this.backendURL);
        await this.cargarDatos();
        setInterval(this.cargarDatos, 10000);
    },
    methods: {
        async cargarDatos() {
            try {
                console.log('📡 Cargando datos de:', this.backendURL);
                
                const [platosRes, ventasRes] = await Promise.all([
                    fetch(`${this.backendURL}/api/platos`),
                    fetch(`${this.backendURL}/api/ventas/equipos`)
                ]);
                
                console.log('📊 Respuesta platos:', platosRes.status);
                console.log('📊 Respuesta ventas:', ventasRes.status);
                
                if (platosRes.ok && ventasRes.ok) {
                    this.platos = await platosRes.json();
                    this.ventasPorEquipo = await ventasRes.json();
                    this.estadoConexion = '✅ Conectado - Datos en tiempo real';
                    console.log('✅ Datos cargados correctamente');
                } else {
                    throw new Error(`Platos: ${platosRes.status}, Ventas: ${ventasRes.status}`);
                }
                
            } catch (error) {
                console.error('❌ Error cargando datos:', error);
                this.estadoConexion = '❌ Error de conexión';
            }
            
            // ✅ CORREGIDO: Sin this.$set
            this.platos.forEach(plato => {
                if (this.venta.cantidades[plato.id] === undefined) {
                    this.venta.cantidades[plato.id] = 0;
                }
            });
        },
        
        async registrarVenta() {
            const totalVendido = Object.values(this.venta.cantidades).reduce((a, b) => a + b, 0);
            
            if (totalVendido === 0) {
                alert('❌ Debes vender al menos un plato');
                return;
            }
            
            if (!this.venta.equipo) {
                alert('❌ Debes seleccionar un equipo');
                return;
            }

            this.loading = true;

            try {
                const response = await fetch(`${this.backendURL}/api/ventas`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(this.venta)
                });

                const result = await response.json();

                if (response.ok) {
                    alert('✅ Venta registrada exitosamente!');
                    // Resetear formulario
                    Object.keys(this.venta.cantidades).forEach(key => {
                        this.venta.cantidades[key] = 0;
                    });
                    this.venta.equipo = '';
                    
                    // Recargar datos
                    await this.cargarDatos();
                } else {
                    alert(`❌ Error: ${result.error}`);
                }
            } catch (error) {
                console.error('Error:', error);
                alert('❌ Error de conexión con el servidor');
            } finally {
                this.loading = false;
            }
        }
    }
}).mount('#app');