<script>
export default {
  provide: ["dataVar", 'computedVar', "methodVar"],
  data() {
    return {
      dataVar: 0,
    }
  },
  computed: {
    computedVar() {
      return "1"
    },
  },
  methods: {
    methodVar() {
      console.log("test")
    },
  },
}
</script>