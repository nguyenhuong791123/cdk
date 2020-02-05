import * as cdk from '@aws-cdk/core';
import ec2 = require('@aws-cdk/aws-ec2');
import elbv2 = require("@aws-cdk/aws-elasticloadbalancingv2");
import { AutoScalingGroup } from "@aws-cdk/aws-autoscaling";
import { ManagedPolicy, Role, ServicePrincipal } from "@aws-cdk/aws-iam";
import route53 = require('@aws-cdk/aws-route53');
import * as balancer from './balancer';

import o from '../utils/setting.json';

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, o.VPC_NAME, {
      cidr: o.CIDR,
      subnetConfiguration: [
          { name: o.VPC_NAME + "-Public", cidrMask: 24, subnetType: ec2.SubnetType.PUBLIC }
          ,{ name: o.VPC_NAME + "-Private", cidrMask: 24, subnetType: ec2.SubnetType.PRIVATE }
      ]
    });

    vpc.node.applyAspect(new cdk.Tag("Name", "CdkApplyAspectVpc"));
    for (let subnet of vpc.publicSubnets) {
      subnet.node.applyAspect(new cdk.Tag("Name", o.SUBNET_NAME + `${subnet.node.id.replace(/Subnet[0-9]$/, "")}-${subnet.availabilityZone}`));
    }
    for (let subnet of vpc.privateSubnets) {
      subnet.node.applyAspect(new cdk.Tag("Name", o.SUBNET_NAME + `${subnet.node.id.replace(/Subnet[0-9]$/, "")}-${subnet.availabilityZone}`));
    }

    const cdkSG = new ec2.SecurityGroup(this, o.SECURITY_GROUP_NAME, {
      allowAllOutbound: true,
      securityGroupName: o.SECURITY_GROUP_NAME,
      vpc: vpc
    });
    cdkSG.addIngressRule(cdkSG, ec2.Port.tcp(80));
    cdkSG.node.applyAspect(new cdk.Tag("Name", o.EC2_NAME));

    const cmd = ec2.UserData.forLinux();
    const SSM_AGENT_RPM='https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm';
    cmd.addCommands(`yum install -y ${SSM_AGENT_RPM}`, 'restart amazon-ssm-agent');
    cmd.addCommands("amazon-linux-extras install -y nginx1.12", "systemctl enable nginx", "systemctl start nginx");

    const insRole = new Role(this, o.ROLE_NAME, {
      assumedBy: new ServicePrincipal(o.EC2_DOMAIN)
      ,roleName: o.ROLE_NAME
      ,managedPolicies: [ ManagedPolicy.fromAwsManagedPolicyName(o.AWS_EC2_ROLE) ]
    });
    const asg = new AutoScalingGroup(
      this
      ,o.AUTO_SCALE_GROUP_NAME
      ,{
        vpc: vpc
        ,instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.MICRO)
        ,machineImage: new ec2.AmazonLinuxImage({ generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2 })
        ,minCapacity: 2
        ,allowAllOutbound: true
        ,role: insRole
      }
    );
    asg.addSecurityGroup(cdkSG);
    asg.addUserData(cmd.render());
    const albt: elbv2.IApplicationLoadBalancerTarget[] = [];
    albt.push(asg);

    // for (let privateSubnet of vpc.privateSubnets) {
        // const instance = new ec2.CfnInstance(
        //   this
        //   ,`ec2-${privateSubnet.node.id}`
        //   ,{
        //     imageId: new ec2.AmazonLinuxImage({ generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2 }).getImage(this).imageId
        //     ,instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.MICRO)
        //     // ,keyName: node.tryGetContext("key")
        //     ,subnetId: privateSubnet.subnetId
        //     ,securityGroupIds: [ cdkSG.securityGroupId ]
        //     ,tags: [{ key: "Name", value: `Cdk-Web-${privateSubnet.availabilityZone}` } ]
        //     ,userData: cdk.Fn.base64(cmd.render())
        //   }
        // );
        // targets.push(new elbv2.InstanceTarget(instance.ref.toString()));
    // }

    const alb = new elbv2.ApplicationLoadBalancer(
      this
      ,o.LOADBALANE_NAME
      ,{ vpc: vpc, internetFacing: true, loadBalancerName: o.LOADBALANE_NAME });
    alb.addListener(
      "Listener"
      ,{
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        open: true,
        defaultTargetGroups: [
          new elbv2.ApplicationTargetGroup(
            this
            ,"TargetGroup"
            ,{
              vpc: vpc
              ,port: 80
              ,protocol: elbv2.ApplicationProtocol.HTTP
              ,healthCheck: { path: "/index.html", port: "80", protocol: elbv2.Protocol.HTTP }
              ,targetGroupName: o.TARGET_GROUP_NAME
              ,targets: albt
            }
          )
      ]
    });

    const albSG = ec2.SecurityGroup.fromSecurityGroupId(this, o.LOADBALANE_SECURITY_GROUP_NAME, cdk.Fn.select(0, alb.loadBalancerSecurityGroups));
    albSG.addEgressRule(cdkSG, ec2.Port.tcp(80));
    cdkSG.addIngressRule(albSG, ec2.Port.tcp(80));

    const zone = route53.HostedZone.fromLookup(this, o.HOST_ZONE_NAME, { "domainName": o.DOMAIN });
    new route53.ARecord(
      this
      ,o.ROUTE53_RECORD_NAME
      ,{
        zone
        ,recordName: o.DOMAIN
        ,target: route53.RecordTarget.fromAlias(new balancer.LoadBalancerTarget(alb))
      }
    );
  }
}
