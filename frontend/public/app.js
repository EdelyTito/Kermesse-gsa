const { createApp } = Vue;

// URL del backend en Railway - se actualizará después del deploy
let backendURL = 'https://kermesse-gsa.up.railway.app';

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
            backendURL: backendURL
        }
    },
    async mounted() {
        // Intentar detectar la URL automáticamente en producción
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            // En producción, usar URL relativa (mismo dominio si usamos funciones serverless)
            this.backendURL = window.location.origin;
        }
        
        await this.cargarDatos();
        // Actualizar cada 10 segundos
        setInterval(this.cargarDatos, 10000);
    },
    methods: {
        async cargarDatos() {
            try {
                const [platosRes, ventasRes] = await Promise.all([
                    fetch(`${this.backendURL}/api/platos`),
                    fetch(`${this.backendURL}/api/ventas/equipos`)
                ]);
                
                if (!platosRes.ok || !ventasRes.ok) {
                    throw new Error('Error cargando datos');
                }
                
                this.platos = await platosRes.json();
                this.ventasPorEquipo = await ventasRes.json();
                
                // Inicializar cantidades para nuevos platos
                this.platos.forEach(plato => {
                    if (this.venta.cantidades[plato.id] === undefined) {
                        this.$set(this.venta.cantidades, plato.id, 0);
                    }
                });
                
            } catch (error) {
                console.error('Error cargando datos:', error);
                // No mostrar alerta para evitar spam
            }
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