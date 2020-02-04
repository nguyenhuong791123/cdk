import * as cdk from '@aws-cdk/core';
import ec2 = require('@aws-cdk/aws-ec2');
import elbv2 = require("@aws-cdk/aws-elasticloadbalancingv2");
import { AutoScalingGroup } from "@aws-cdk/aws-autoscaling";
import { ManagedPolicy, Role, ServicePrincipal } from "@aws-cdk/aws-iam";
import {
  AmazonLinuxImage,
  InstanceClass,
  InstanceSize,
  InstanceType,
  ISecurityGroup,
  IVpc,
  SubnetType
} from "@aws-cdk/aws-ec2";

import o from '../utils/setting.json';

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "CdkVPC", {
      cidr: o.cidr,
      subnetConfiguration: [
          { name: "Cdk-Public", cidrMask: 24, subnetType: ec2.SubnetType.PUBLIC }
          ,{ name: "Cdk-Private", cidrMask: 24, subnetType: ec2.SubnetType.PRIVATE }
      ]
    });

    vpc.node.applyAspect(new cdk.Tag("Name", "Cdk-Vpc"));
    for (let subnet of vpc.publicSubnets) {
      subnet.node.applyAspect(new cdk.Tag("Name", `${subnet.node.id.replace(/Subnet[0-9]$/, "")}-${subnet.availabilityZone}`));
    }
    for (let subnet of vpc.privateSubnets) {
      subnet.node.applyAspect(new cdk.Tag("Name", `${subnet.node.id.replace(/Subnet[0-9]$/, "")}-${subnet.availabilityZone}`));
    }

    const cdkSG = new ec2.SecurityGroup(this, o.sg_name, {
      allowAllOutbound: true,
      securityGroupName: o.sg_name,
      vpc: vpc
    });
    cdkSG.node.applyAspect(new cdk.Tag("Name", o.ec2_name));

    const cmd = ec2.UserData.forLinux();
    const SSM_AGENT_RPM='https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm';
    cmd.addCommands('echo', 'Cdk Run !!!');
    cmd.addCommands(`yum install -y ${SSM_AGENT_RPM}`, 'restart amazon-ssm-agent');
    cmd.addCommands("amazon-linux-extras install -y nginx1.12", "systemctl enable nginx", "systemctl start nginx");

    const instanceRole = new Role(this, "IamRole", {
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
      roleName: `Cdk-iam-role`,
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonEC2RoleforSSM"
        )
      ]
    });
    const targets: elbv2.IApplicationLoadBalancerTarget[] = [];
    const asg = new AutoScalingGroup(this, "ASG", {
      vpc: vpc
      ,instanceType: InstanceType.of(InstanceClass.BURSTABLE2, InstanceSize.MICRO)
      ,machineImage: new AmazonLinuxImage()
      ,allowAllOutbound: true
      ,role: instanceRole
    });
    asg.addSecurityGroup(cdkSG);
    asg.addUserData(
      // "yum -y update",
      "yum -y install nginx",
      "systemctl enable nginx",
      "systemctl start nginx"
    );
    targets.push(asg);

    // for (let privateSubnet of vpc.privateSubnets) {
        // const instance = new ec2.CfnInstance(
        //   this
        //   ,`WebInstance-${privateSubnet.node.id}`
        //   ,{
        //     imageId: new ec2.AmazonLinuxImage({ generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2 }).getImage(this).imageId
        //     ,instanceType: o.ec2_type
        //     // ,keyName: node.tryGetContext("key")
        //     ,subnetId: privateSubnet.subnetId
        //     ,securityGroupIds: [ cdkSG.securityGroupId ]
        //     ,tags: [{ key: "Name", value: `Cdk-Web-${privateSubnet.availabilityZone}` } ]
        //     ,userData: cdk.Fn.base64(cmd.render())
        //   }
        // );
        // targets.push(new elbv2.InstanceTarget(instance.ref.toString()));
    // }

    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", { vpc: vpc, internetFacing: true, loadBalancerName: "Cdk-Alb" });
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
              ,targetGroupName: "Cdk-Web-TargetGroup"
              ,targets: targets
            }
          )
      ]
    });

    const albSG = ec2.SecurityGroup.fromSecurityGroupId(this, "AlbSG", cdk.Fn.select(0, alb.loadBalancerSecurityGroups));
    albSG.addEgressRule(cdkSG, ec2.Port.tcp(80));
    cdkSG.addIngressRule(albSG, ec2.Port.tcp(80));
  }
}
